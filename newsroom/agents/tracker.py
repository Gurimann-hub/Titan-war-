"""Tracker Agent: Collects candidate stories from feeds, SEC EDGAR, and monitors watchlist market shifts."""

from __future__ import annotations
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

from newsroom.agents.base import BaseAgent
from newsroom.bus import MessageBus, TOPIC_RAW_CANDIDATE, TOPIC_MARKET_SHIFT
from newsroom.tools import (
    safe_http_get,
    parse_xml_feed_items,
    detect_sudden_price_shift,
    detect_volume_spike,
    scan_trigger_keywords,
)

class TrackerAgent(BaseAgent):
    """
    Scouts candidate stories from multi-source RSS feeds, regulatory disclosures,
    and monitors market anomalies (price drops/spikes, volume surges, keywords).
    """

    def __init__(self, bus: MessageBus, config: Dict[str, Any]) -> None:
        super().__init__("Tracker", bus, config)
        self.watchlist = config.get("watchlist", {}).get("tickers", ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA"])
        self.shift_cfg = config.get("shift_detection", {})
        self.feed_urls = [
            ("https://finance.yahoo.com/news/rssindex", "Yahoo Finance"),
            ("https://feeds.a.dj.com/rss/RSSMarketsMain.xml", "WSJ Markets"),
            ("https://search.cnbc.com/rs/search/view.html?partnerId=2000&keywords=technology&sort=date", "CNBC Tech"),
            ("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom", "SEC EDGAR 8-K")
        ]

    def poll_feeds(self) -> List[Dict[str, Any]]:
        """Fetches active news feeds and extracts raw story candidates."""
        candidates: List[Dict[str, Any]] = []

        for url, source_name in self.feed_urls:
            self.logger.debug(f"Polling feed: {source_name} ({url})")
            xml_data = safe_http_get(url, timeout=6)
            if not xml_data:
                continue

            items = parse_xml_feed_items(xml_data, default_source=source_name)
            for item in items:
                candidate = {
                    "id": f"raw_{uuid.uuid4().hex[:10]}",
                    "title": item["title"],
                    "summary": item.get("summary", ""),
                    "url": item["url"],
                    "source": source_name,
                    "published_at": item.get("published_at", datetime.now(timezone.utc).isoformat()),
                    "matched_tickers": self._match_watchlist_tickers(item["title"] + " " + item.get("summary", "")),
                    "keywords": scan_trigger_keywords(item["title"] + " " + item.get("summary", ""), self.shift_cfg.get("keywords", []))
                }
                candidates.append(candidate)
                self.publish_event(TOPIC_RAW_CANDIDATE, candidate, correlation_id=candidate["id"])

        self.logger.info(f"Tracker harvested {len(candidates)} raw candidates from feeds.")
        return candidates

    def inspect_ticker_shift(
        self,
        ticker: str,
        current_price: float,
        reference_price: float,
        current_volume: float = 0.0,
        avg_volume_20d: float = 0.0,
        std_dev_volume: float = 0.0,
        trigger_context: str = ""
    ) -> Optional[Dict[str, Any]]:
        """
        Inspects sudden market shifts for a specific ticker based on price, volume, and keywords.
        Emits TOPIC_MARKET_SHIFT when thresholds are breached.
        """
        threshold_pct = float(self.shift_cfg.get("price_change_pct", 4.0))
        z_threshold = float(self.shift_cfg.get("volume_std_dev", 2.5))
        keywords = self.shift_cfg.get("keywords", [])

        is_price_shift, price_pct = detect_sudden_price_shift(current_price, reference_price, threshold_pct)
        is_vol_spike, vol_z = detect_volume_spike(current_volume, avg_volume_20d, std_dev_volume, z_threshold) if std_dev_volume > 0 else (False, 0.0)
        matched_kws = scan_trigger_keywords(trigger_context, keywords)

        if is_price_shift or is_vol_spike or len(matched_kws) > 0:
            shift_payload = {
                "id": f"shift_{ticker}_{uuid.uuid4().hex[:6]}",
                "ticker": ticker,
                "current_price": current_price,
                "reference_price": reference_price,
                "price_change_pct": price_pct,
                "is_price_shift": is_price_shift,
                "volume_z_score": vol_z,
                "is_volume_spike": is_vol_spike,
                "matched_keywords": matched_kws,
                "trigger_context": trigger_context,
                "detected_at": datetime.now(timezone.utc).isoformat()
            }
            self.logger.warning(
                f"🚨 SUDDEN SHIFT DETECTED for {ticker}: {price_pct:+.2f}% move, "
                f"vol_z={vol_z:.1f}, keywords={matched_kws}"
            )
            self.publish_event(TOPIC_MARKET_SHIFT, shift_payload, correlation_id=shift_payload["id"])
            return shift_payload

        return None

    def _match_watchlist_tickers(self, text: str) -> List[str]:
        """Detects watchlist ticker symbols in text."""
        import re
        matched = []
        for ticker in self.watchlist:
            pattern = rf"\b{re.escape(ticker)}\b"
            if re.search(pattern, text, re.IGNORECASE):
                matched.append(ticker)
        return list(set(matched))
