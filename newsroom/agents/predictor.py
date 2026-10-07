"""Predictor Agent (Market Analyst): Assesses market impact (1-10), identifies affected sectors/tickers, and classifies category."""

from __future__ import annotations
from typing import Dict, List, Any, Optional

from newsroom.agents.base import BaseAgent
from newsroom.bus import MessageBus, TOPIC_ANALYZED

TICKER_TO_COMPANY = {
    "NVDA": "NVIDIA Corporation",
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.",
    "META": "Meta Platforms Inc.",
    "TSLA": "Tesla Inc.",
    "AMD": "Advanced Micro Devices",
    "INTC": "Intel Corporation",
    "TSM": "Taiwan Semiconductor",
    "ASML": "ASML Holding"
}

SECTOR_MAP = {
    "NVDA": ["AMD", "TSM", "INTC", "ASML", "QCOM"],
    "AAPL": ["MSFT", "GOOGL", "QCOM", "SONY"],
    "MSFT": ["AMZN", "GOOGL", "ORCL", "CRM"],
    "GOOGL": ["META", "MSFT", "AMZN", "AAPL"],
    "AMZN": ["MSFT", "GOOGL", "WMT", "BABA"],
    "META": ["GOOGL", "SNAP", "PINS", "MSFT"],
    "TSLA": ["RIVN", "LCID", "F", "GM", "BYD"]
}

HIGH_IMPACT_KEYWORDS = {
    "export controls": 9,
    "chip ban": 9,
    "antitrust": 8,
    "national security": 8,
    "investigation": 8,
    "subpoena": 8,
    "lawsuit": 7,
    "layoffs": 7,
    "earnings surprise": 8,
    "merger": 8,
    "acquisition": 8,
    "outage": 7,
    "data breach": 8
}

class PredictorAgent(BaseAgent):
    """
    Evaluates market reverberations, cross-asset spillovers, impact score (1-10),
    and assigns primary category (big-tech, corporate, market-shift).
    """

    def __init__(self, bus: MessageBus, config: Dict[str, Any]) -> None:
        super().__init__("Predictor", bus, config)

    def analyze_event(
        self,
        headline: str,
        summary: str,
        primary_ticker: Optional[str] = None,
        price_drop_pct: Optional[float] = None,
        keywords: Optional[List[str]] = None,
        status: str = "confirmed"
    ) -> Dict[str, Any]:
        """
        Analyzes a verified story or market shift to determine impact score,
        affected tickers, companies, and category.
        """
        keywords = keywords or []
        combined_text = f"{headline} {summary}".lower()

        # 1. Base impact score
        impact = 5 # baseline moderate news

        # Evaluate keyword multipliers
        for kw, score in HIGH_IMPACT_KEYWORDS.items():
            if kw in combined_text:
                impact = max(impact, score)

        # Evaluate sudden price moves
        if price_drop_pct is not None:
            abs_drop = abs(price_drop_pct)
            if abs_drop >= 6.0:
                impact = max(impact, 9)
            elif abs_drop >= 4.0:
                impact = max(impact, 8)
            elif abs_drop >= 2.0:
                impact = max(impact, 6)

        impact = min(10, max(1, impact))

        # 2. Identify tickers and related peers
        active_tickers: List[str] = []
        if primary_ticker:
            active_tickers.append(primary_ticker.upper())

        for tick in TICKER_TO_COMPANY.keys():
            if tick not in active_tickers and (f" {tick.lower()} " in f" {combined_text} " or TICKER_TO_COMPANY[tick].lower() in combined_text):
                active_tickers.append(tick)

        # Peer spillovers
        related_tickers = []
        for t in active_tickers:
            for peer in SECTOR_MAP.get(t, []):
                if peer not in active_tickers and peer not in related_tickers:
                    related_tickers.append(peer)

        all_tickers = active_tickers + related_tickers[:3] # keep top relevant peers
        companies = [TICKER_TO_COMPANY.get(t, t) for t in active_tickers]

        # 3. Determine category
        if price_drop_pct is not None and abs(price_drop_pct) >= 4.0:
            category = "market-shift"
        elif any(t in {"NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA"} for t in active_tickers):
            category = "big-tech"
        else:
            category = "corporate"

        # 4. Breaking status escalation
        effective_status = status
        if impact >= 8 and (price_drop_pct is not None and abs(price_drop_pct) >= 4.0 or "export controls" in combined_text or "breaking" in combined_text):
            effective_status = "breaking"

        analysis = {
            "headline": headline,
            "impact_score": impact,
            "category": category,
            "status": effective_status,
            "primary_ticker": primary_ticker,
            "tickers": all_tickers,
            "companies": companies,
            "price_drop_pct": price_drop_pct
        }

        self.logger.info(
            f"Analysis complete: Impact={impact}/10, Category={category}, "
            f"Status={effective_status}, Tickers={all_tickers}"
        )
        self.publish_event(TOPIC_ANALYZED, analysis)
        return analysis
