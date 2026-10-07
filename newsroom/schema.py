"""Data contracts, schema validation, and models for the newsroom platform."""

from __future__ import annotations
import re
import html
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

VALID_CATEGORIES = {"big-tech", "corporate", "market-shift"}
VALID_STATUSES = {"breaking", "confirmed", "developing"}
DISCLAIMER_TEXT = "AI estimate, not financial advice"

@dataclass
class SourceRef:
    name: str
    url: str

    def to_dict(self) -> Dict[str, str]:
        return {"name": self.name, "url": self.url}

@dataclass
class Story:
    id: str
    slug: str
    headline: str
    summary: str
    why_it_matters: str
    category: str
    companies: List[str]
    tickers: List[str]
    impact_score: int
    status: str
    sources: List[Dict[str, str]]
    published_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "slug": self.slug,
            "headline": self.headline,
            "summary": self.summary,
            "why_it_matters": self.why_it_matters,
            "category": self.category,
            "companies": list(self.companies),
            "tickers": list(self.tickers),
            "impact_score": int(self.impact_score),
            "status": self.status,
            "sources": list(self.sources),
            "published_at": self.published_at,
        }

def slugify(text: str) -> str:
    """Converts a title or text into a clean URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:80].strip("-")

def sanitize_text(text: str) -> str:
    """Sanitizes text against XSS injection by escaping HTML entities and stripping dangerous tags."""
    if not text:
        return ""
    # Strip script/style/html tags
    cleaned = re.sub(r"<[^>]+>", "", text)
    # Escape HTML special characters
    return html.escape(cleaned.strip())

def count_words(text: str) -> int:
    """Returns the word count for a given text snippet."""
    if not text:
        return 0
    return len(re.findall(r"\b\w+\b", text))

def validate_story_dict(data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validates a raw story dictionary against the strict newsroom schema.
    Returns (is_valid, list_of_errors).
    """
    errors: List[str] = []

    required_fields = [
        "id", "slug", "headline", "summary", "why_it_matters",
        "category", "companies", "tickers", "impact_score",
        "status", "sources", "published_at"
    ]

    for req in required_fields:
        if req not in data:
            errors.append(f"Missing required field: '{req}'")

    if errors:
        return False, errors

    # Category validation
    if data["category"] not in VALID_CATEGORIES:
        errors.append(f"Invalid category '{data['category']}'; must be one of {sorted(VALID_CATEGORIES)}")

    # Status validation
    if data["status"] not in VALID_STATUSES:
        errors.append(f"Invalid status '{data['status']}'; must be one of {sorted(VALID_STATUSES)}")

    # Impact score bounds
    try:
        score = int(data["impact_score"])
        if score < 1 or score > 10:
            errors.append(f"impact_score must be between 1 and 10, got {score}")
    except (ValueError, TypeError):
        errors.append("impact_score must be an integer between 1 and 10")

    # Word count constraint: max 60 words
    summary_words = count_words(str(data.get("summary", "")))
    if summary_words > 60:
        errors.append(f"Summary exceeds 60 words limit (found {summary_words} words)")

    # Sources check
    sources = data.get("sources", [])
    if not isinstance(sources, list) or len(sources) == 0:
        errors.append("Story must have at least one valid source in 'sources'")
    else:
        for idx, src in enumerate(sources):
            if not isinstance(src, dict) or "name" not in src or "url" not in src:
                errors.append(f"Source at index {idx} must be an object with 'name' and 'url'")
            elif not str(src["url"]).startswith(("http://", "https://")):
                errors.append(f"Source at index {idx} has invalid URL: {src['url']}")

    # Tickers and companies
    if not isinstance(data.get("tickers", []), list):
        errors.append("tickers must be a list of strings")
    if not isinstance(data.get("companies", []), list):
        errors.append("companies must be a list of strings")

    return (len(errors) == 0), errors

def build_feed_payload(stories: List[Dict[str, Any]], feed_name: str = "Titan War Intelligence Newsroom") -> Dict[str, Any]:
    """Wraps stories inside the standard feed metadata format with the mandatory disclaimer."""
    return {
        "metadata": {
            "feed_name": feed_name,
            "version": "1.0",
            "disclaimer": DISCLAIMER_TEXT,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "total_stories": len(stories),
        },
        "stories": stories
    }
