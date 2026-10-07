"""Shared tools module used across all newsroom agents.

Includes:
- Robust HTTP client with retries, exponential backoff, and timeouts.
- SEC EDGAR and RSS XML feeds extractor with XXE protection.
- Market data shift calculators (price %, volume z-score, keywords).
- Safe atomic file writer with rolling history backups.
- XSS sanitizer utilities.
"""

from __future__ import annotations
import os
import re
import json
import time
import math
import shutil
import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger("newsroom.tools")

DEFAULT_TIMEOUT = 10
MAX_RETRIES = 3
BACKOFF_FACTOR = 1.5

def safe_http_get(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = DEFAULT_TIMEOUT) -> Optional[str]:
    """
    Performs an HTTP GET request with retries, exponential backoff, and custom timeout.
    Enforces secure timeouts and proper User-Agent headers.
    """
    req_headers = {
        "User-Agent": os.getenv("SEC_EDGAR_USER_AGENT", "TitanWarNewsroom admin@titanwar.intel"),
        "Accept": "application/json, application/rss+xml, application/atom+xml, text/xml, */*"
    }
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, headers=req_headers)
    delay = 1.0

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                if response.status == 200:
                    charset = response.headers.get_content_charset() or "utf-8"
                    return response.read().decode(charset, errors="replace")
                logger.warning(f"HTTP GET {url} returned status {response.status}")
                return None
        except urllib.error.HTTPError as http_err:
            if http_err.code in {429, 500, 502, 503, 504} and attempt < MAX_RETRIES:
                logger.warning(f"HTTP {http_err.code} on {url}. Retrying in {delay:.1f}s (attempt {attempt}/{MAX_RETRIES})...")
                time.sleep(delay)
                delay *= BACKOFF_FACTOR
            else:
                logger.error(f"HTTP error {http_err.code} fetching {url}: {http_err.reason}")
                return None
        except (urllib.error.URLError, TimeoutError, OSError) as net_err:
            if attempt < MAX_RETRIES:
                logger.warning(f"Network error on {url}: {net_err}. Retrying in {delay:.1f}s...")
                time.sleep(delay)
                delay *= BACKOFF_FACTOR
            else:
                logger.error(f"Failed to fetch {url} after {MAX_RETRIES} attempts: {net_err}")
                return None
    return None

def parse_xml_feed_items(xml_content: str, default_source: str = "RSS Feed") -> List[Dict[str, Any]]:
    """
    Parses RSS or Atom XML content safely using regex without invoking vulnerable XML entity evaluators.
    Prevents XXE attacks.
    """
    if not xml_content:
        return []

    # Strip dangerous DTD and entities
    sanitized = re.sub(r"<!DOCTYPE[^>]*>", "", xml_content, flags=re.IGNORECASE)
    sanitized = re.sub(r"<!ENTITY[^>]*>", "", sanitized, flags=re.IGNORECASE)

    items: List[Dict[str, Any]] = []

    # 1. Search RSS <item>
    rss_items = re.findall(r"<item\b[^>]*>(.*?)</item>", sanitized, flags=re.DOTALL | re.IGNORECASE)
    for raw in rss_items:
        title_m = re.search(r"<title\b[^>]*>(.*?)</title>", raw, flags=re.DOTALL | re.IGNORECASE)
        desc_m = re.search(r"<(?:description|summary)\b[^>]*>(.*?)</(?:description|summary)>", raw, flags=re.DOTALL | re.IGNORECASE)
        link_m = re.search(r"<link\b[^>]*>(.*?)</link>", raw, flags=re.DOTALL | re.IGNORECASE)
        pub_m = re.search(r"<(?:pubDate|dc:date)\b[^>]*>(.*?)</(?:pubDate|dc:date)>", raw, flags=re.DOTALL | re.IGNORECASE)

        title = clean_xml_text(title_m.group(1)) if title_m else ""
        summary = clean_xml_text(desc_m.group(1)) if desc_m else title
        link = clean_xml_text(link_m.group(1)) if link_m else ""
        pub_date = pub_m.group(1).strip() if pub_m else datetime.now(timezone.utc).isoformat()

        if title:
            items.append({
                "title": title,
                "summary": summary,
                "url": link,
                "source": default_source,
                "published_at": pub_date
            })

    # 2. Search Atom <entry>
    if not items:
        atom_entries = re.findall(r"<entry\b[^>]*>(.*?)</entry>", sanitized, flags=re.DOTALL | re.IGNORECASE)
        for raw in atom_entries:
            title_m = re.search(r"<title\b[^>]*>(.*?)</title>", raw, flags=re.DOTALL | re.IGNORECASE)
            summary_m = re.search(r"<(?:summary|content)\b[^>]*>(.*?)</(?:summary|content)>", raw, flags=re.DOTALL | re.IGNORECASE)
            link_m = re.search(r'<link\b[^>]*href=["\']([^"\']+)["\']', raw, flags=re.IGNORECASE)

            title = clean_xml_text(title_m.group(1)) if title_m else ""
            summary = clean_xml_text(summary_m.group(1)) if summary_m else title
            link = link_m.group(1).strip() if link_m else ""

            if title:
                items.append({
                    "title": title,
                    "summary": summary,
                    "url": link,
                    "source": default_source,
                    "published_at": datetime.now(timezone.utc).isoformat()
                })

    return items

def clean_xml_text(raw: str) -> str:
    """Strips CDATA markers, unescapes basic HTML entities, and trims whitespace."""
    if not raw:
        return ""
    text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", raw, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'").replace("&apos;", "'")
    return re.sub(r"\s+", " ", text).strip()

def detect_sudden_price_shift(
    current_price: float,
    reference_price: float,
    threshold_pct: float = 4.0
) -> Tuple[bool, float]:
    """
    Computes percentage price difference and checks if it exceeds threshold.
    Returns (is_shift, pct_change).
    """
    if reference_price <= 0:
        return False, 0.0
    pct = ((current_price - reference_price) / reference_price) * 100.0
    is_shift = abs(pct) >= threshold_pct
    return is_shift, round(pct, 2)

def detect_volume_spike(current_volume: float, avg_volume_20d: float, std_dev_volume: float, z_threshold: float = 2.5) -> Tuple[bool, float]:
    """
    Calculates z-score of current volume relative to 20-day mean and standard deviation.
    Returns (is_spike, z_score).
    """
    if std_dev_volume <= 0:
        return False, 0.0
    z_score = (current_volume - avg_volume_20d) / std_dev_volume
    is_spike = z_score >= z_threshold
    return is_spike, round(z_score, 2)

def scan_trigger_keywords(text: str, keywords: List[str]) -> List[str]:
    """Returns all triggering keywords found within the text."""
    lower = text.lower()
    matches = []
    for kw in keywords:
        pattern = r"\b" + re.escape(kw.lower()) + r"\b"
        if re.search(pattern, lower):
            matches.append(kw)
    return matches

def atomic_write_json(file_path: str, data: Dict[str, Any], history_dir: Optional[str] = None, max_backups: int = 20) -> str:
    """
    Atomically writes JSON data using a temporary file and atomic file replacement.
    Maintains a rolling archive of the last 20 versions in history_dir.
    """
    target = Path(file_path).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)

    # 1. Archive previous good version if exists
    if target.exists() and history_dir:
        hist_path = Path(history_dir).resolve()
        hist_path.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        backup_file = hist_path / f"news_{timestamp}.json"
        shutil.copy2(target, backup_file)

        # Enforce rolling retention limit (keep newest N files)
        backups = sorted(hist_path.glob("news_*.json"), key=os.path.getmtime)
        if len(backups) > max_backups:
            for old_file in backups[:-max_backups]:
                try:
                    old_file.unlink()
                except OSError as err:
                    logger.warning(f"Could not purge old backup {old_file}: {err}")

    # 2. Write to temp file in same directory
    temp_file = target.parent / f".tmp_{target.name}_{os.getpid()}_{time.time()}"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())

    # 3. Atomic replace
    os.replace(temp_file, target)
    logger.info(f"Atomically wrote {len(data.get('stories', []))} stories to {target}")
    return str(target)
