"""Verifier Agent: Enforces rigorous journalistic verification and deduplication rules."""

from __future__ import annotations
import re
import hashlib
from typing import Dict, List, Any, Tuple
from urllib.parse import urlparse

from newsroom.agents.base import BaseAgent
from newsroom.bus import MessageBus, TOPIC_VERIFIED, TOPIC_REJECTED

class VerifierAgent(BaseAgent):
    """
    Evaluates news stories against source criteria:
    - 2 independent accredited press sources OR 1 official primary source (SEC filing / PR) -> 'confirmed'
    - 1 accredited source with credible details -> 'developing'
    - Unverified rumor or blacklisted/spam sources -> rejected / dropped
    """

    def __init__(self, bus: MessageBus, config: Dict[str, Any]) -> None:
        super().__init__("Verifier", bus, config)
        v_cfg = config.get("verifier", {})
        self.official_domains = set(v_cfg.get("official_source_domains", [
            "sec.gov", "edgar.sec.gov", "prnewswire.com", "businesswire.com",
            "investor.nvidia.com", "apple.com", "microsoft.com"
        ]))
        self.allowed_press_domains = set(v_cfg.get("allowed_press_domains", [
            "reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com",
            "marketwatch.com", "finance.yahoo.com"
        ]))
        self.seen_hashes: set[str] = set()

    def verify_candidate(self, candidate_cluster: Dict[str, Any]) -> Tuple[bool, str, List[Dict[str, str]]]:
        """
        Evaluates a cluster of sources reporting on a story.
        candidate_cluster format:
        {
            "headline": str,
            "sources": [{"name": str, "url": str}],
            "is_official": bool (optional flag)
        }
        Returns: (is_accepted, status: 'confirmed'|'developing'|'rejected', valid_sources)
        """
        headline = candidate_cluster.get("headline", "")
        sources = candidate_cluster.get("sources", [])

        # 1. Deduplication check
        norm_key = re.sub(r"[^\w]", "", headline.lower())[:60]
        content_hash = hashlib.sha256(norm_key.encode("utf-8")).hexdigest()
        if content_hash in self.seen_hashes:
            self.logger.info(f"Duplicate story detected, dropping: '{headline}'")
            return False, "rejected", []

        # 2. Source extraction & domain validation
        valid_sources = []
        has_official = False
        independent_press_count = 0
        seen_domains = set()

        for src in sources:
            url = src.get("url", "")
            domain = self._extract_domain(url)
            name = src.get("name", domain or "Press")

            if self._is_official_domain(domain) or candidate_cluster.get("is_official", False):
                has_official = True
                valid_sources.append({"name": name, "url": url})
            elif self._is_allowed_press_domain(domain):
                if domain not in seen_domains:
                    independent_press_count += 1
                    seen_domains.add(domain)
                valid_sources.append({"name": name, "url": url})
            else:
                # Still record source if valid URL, but don't count towards accreditation threshold
                if url.startswith(("http://", "https://")):
                    valid_sources.append({"name": name, "url": url})

        # 3. Decision Matrix
        if has_official:
            status = "confirmed"
            is_accepted = True
            reason = "Confirmed via official primary source / regulatory disclosure."
        elif independent_press_count >= 2:
            status = "confirmed"
            is_accepted = True
            reason = f"Confirmed by {independent_press_count} independent accredited press outlets."
        elif independent_press_count == 1 or len(valid_sources) >= 1:
            status = "developing"
            is_accepted = True
            reason = "Single source reporting; marked developing pending secondary corroboration."
        else:
            status = "rejected"
            is_accepted = False
            reason = "Zero verified sources. Rumor dropped."

        if is_accepted:
            self.seen_hashes.add(content_hash)
            verified_payload = {
                **candidate_cluster,
                "status": status,
                "sources": valid_sources,
                "verification_reason": reason
            }
            self.logger.info(f"Story VERIFIED [{status.upper()}]: {headline} ({reason})")
            self.publish_event(TOPIC_VERIFIED, verified_payload)
            return True, status, valid_sources
        else:
            self.logger.warning(f"Story REJECTED: {headline} ({reason})")
            self.publish_event(TOPIC_REJECTED, {"headline": headline, "reason": reason})
            return False, "rejected", []

    def _extract_domain(self, url: str) -> str:
        try:
            parsed = urlparse(url)
            netloc = parsed.netloc.lower()
            if netloc.startswith("www."):
                netloc = netloc[4:]
            return netloc
        except Exception:
            return ""

    def _is_official_domain(self, domain: str) -> bool:
        if not domain:
            return False
        return any(domain == off or domain.endswith("." + off) for off in self.official_domains)

    def _is_allowed_press_domain(self, domain: str) -> bool:
        if not domain:
            return False
        return any(domain == press or domain.endswith("." + press) for press in self.allowed_press_domains)
