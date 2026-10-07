"""Writer Agent: Generates original headline, 60-word summary, and 'why it matters' via pluggable LLM."""

from __future__ import annotations
import os
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional

from newsroom.agents.base import BaseAgent
from newsroom.bus import MessageBus, TOPIC_DRAFTED
from newsroom.schema import sanitize_text, count_words, slugify

class WriterAgent(BaseAgent):
    """
    Crafts original news copy using Anthropic Claude (or pluggable fallback).
    Enforces word limits (summary <= 60 words), XSS sanitization, and links sources.
    """

    def __init__(self, bus: MessageBus, config: Dict[str, Any]) -> None:
        super().__init__("Writer", bus, config)
        w_cfg = config.get("writer", {})
        self.provider = w_cfg.get("llm_provider", "anthropic").lower()
        self.model = w_cfg.get("anthropic_model", "claude-3-7-sonnet-20250219")
        self.max_summary_words = int(w_cfg.get("max_summary_words", 60))

    def write_story(
        self,
        event_analysis: Dict[str, Any],
        raw_context: str,
        sources: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Generates original headline, summary (<= 60 words), and why_it_matters.
        Uses Anthropic API if key is present; otherwise falls back to deterministic expert template.
        """
        headline_input = event_analysis.get("headline", "")
        tickers = event_analysis.get("tickers", [])
        status = event_analysis.get("status", "confirmed")
        impact = event_analysis.get("impact_score", 5)
        companies = event_analysis.get("companies", [])

        # Try LLM generation if configured
        anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        draft = None

        if anthropic_key and self.provider == "anthropic":
            draft = self._call_anthropic(headline_input, raw_context, tickers, companies, impact, anthropic_key)

        if not draft:
            # Deterministic template synthesizer (zero-key / offline / fallback)
            draft = self._synthesize_template(headline_input, raw_context, tickers, companies, impact, status)

        # Enforce strict word count constraint: summary <= 60 words
        draft["summary"] = self._trim_words(draft["summary"], self.max_summary_words)

        # XSS sanitization
        clean_headline = sanitize_text(draft["headline"])
        clean_summary = sanitize_text(draft["summary"])
        clean_why = sanitize_text(draft["why_it_matters"])
        slug = slugify(clean_headline)

        result = {
            "slug": slug,
            "headline": clean_headline,
            "summary": clean_summary,
            "why_it_matters": clean_why,
            "sources": sources,
            "tickers": tickers,
            "companies": companies,
            "impact_score": impact,
            "category": event_analysis.get("category", "big-tech"),
            "status": status
        }

        self.logger.info(f"Writer crafted story: '{clean_headline}' (words={count_words(clean_summary)})")
        self.publish_event(TOPIC_DRAFTED, result)
        return result

    def _call_anthropic(
        self,
        headline: str,
        context: str,
        tickers: List[str],
        companies: List[str],
        impact: int,
        api_key: str
    ) -> Optional[Dict[str, str]]:
        """Invokes Anthropic Messages API with strict JSON schema instructions."""
        prompt = f"""You are a professional financial news editor. Write an ORIGINAL news snippet based on this event:
Context: {headline} | {context}
Tickers: {', '.join(tickers)} | Companies: {', '.join(companies)} | Impact: {impact}/10

Rules:
1. Write an ORIGINAL, punchy headline (do NOT copy the raw headline).
2. Write a clear summary of at most 55 words.
3. Write a single-sentence 'why it matters' line focusing on market and investor implications.
4. Respond ONLY with valid JSON:
{{"headline": "...", "summary": "...", "why_it_matters": "..."}}
"""
        req_data = {
            "model": self.model,
            "max_tokens": 300,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": prompt}]
        }
        try:
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=json.dumps(req_data).encode("utf-8"),
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text_content = data["content"][0]["text"].strip()
                parsed = json.loads(text_content)
                return {
                    "headline": parsed["headline"],
                    "summary": parsed["summary"],
                    "why_it_matters": parsed["why_it_matters"]
                }
        except Exception as err:
            self.logger.warning(f"Anthropic API call failed, falling back to template: {err}")
            return None

    def _synthesize_template(
        self,
        headline: str,
        context: str,
        tickers: List[str],
        companies: List[str],
        impact: int,
        status: str
    ) -> Dict[str, str]:
        """High-precision financial news synthesis when running offline or without LLM keys."""
        primary_company = companies[0] if companies else (tickers[0] if tickers else "Market")
        primary_ticker = tickers[0] if tickers else "EQUITY"

        if "export controls" in headline.lower() or "chip ban" in headline.lower() or "export rules" in headline.lower():
            headline_out = f"Fresh Export Restrictions Cloud Global AI Chip Shipments for {primary_company}"
            summary_out = (
                f"New regulatory directives tighten export limits on high-performance accelerators, "
                f"prompting immediate reassessments across supply chains and customer allocations for {primary_ticker}."
            )
            why_out = (
                f"Immediate revenue exposure in Asian markets threatens near-term shipment guidance, "
                f"with sector-wide ripple effects spanning foundry partners and competing AI hardware developers."
            )
        elif impact >= 8:
            headline_out = f"Sudden Market Disruption Sparks Volatility Across {primary_company} Shares"
            summary_out = (
                f"Unscheduled market pressures and breaking catalyst disclosures triggered an accelerated "
                f"repricing event for {primary_ticker}, driving elevated trading volume across key derivatives desks."
            )
            why_out = (
                f"Sudden institutional rebalancing signals heightened short-term risk premiums and tests support levels "
                f"for the broader tech benchmark."
            )
        else:
            headline_out = f"{primary_company} Discloses Strategic Shift Amid Market Repositioning"
            summary_out = (
                f"Corporate developments and recent performance disclosures for {primary_ticker} indicate "
                f"operational alignment with evolving industry demand drivers."
            )
            why_out = (
                f"Signals long-term operational realignment while near-term margins remain tied to broader tech expenditure cycles."
            )

        return {
            "headline": headline_out,
            "summary": summary_out,
            "why_it_matters": why_out
        }

    def _trim_words(self, text: str, max_words: int) -> str:
        words = text.split()
        if len(words) <= max_words:
            return text
        trimmed = " ".join(words[:max_words])
        if not trimmed.endswith("."):
            trimmed += "..."
        return trimmed
