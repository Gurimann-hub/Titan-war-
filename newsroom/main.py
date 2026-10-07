"""Main CLI entrypoint for the Titan War Multi-Agent Newsroom.

Features:
- Full end-to-end multi-agent orchestration.
- Reference demo mode demonstrating the NVDA breaking scenario.
- Single cycle (--once) or continuous scheduler loop (--loop).
- Dry-run protection by default, activated live with --live.
"""

from __future__ import annotations
import os
import sys
import time
import yaml
import logging
import argparse
from pathlib import Path
from typing import Dict, Any

from newsroom.bus import MessageBus
from newsroom.agents.tracker import TrackerAgent
from newsroom.agents.verifier import VerifierAgent
from newsroom.agents.predictor import PredictorAgent
from newsroom.agents.writer import WriterAgent
from newsroom.agents.commander import CommanderAgent
from newsroom.agents.publisher import PublisherAgent

def setup_logging(level: str = "INFO") -> None:
    """Configures structured terminal logging with timestamp and component tags."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%H:%M:%S"
    )

def load_config(config_path: Path) -> Dict[str, Any]:
    """Loads configuration yaml file."""
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found at: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

def run_reference_demo(
    config: Dict[str, Any],
    dry_run: bool = True,
    auto_approve: bool = True
) -> Dict[str, Any]:
    """
    Executes the Reference Scenario:
    NVDA falls 6% in 20 minutes while a headline about new chip export rules appears.
    1. Tracker detects sudden drop and export controls context.
    2. Verifier confirms with 2 sources + 1 filing.
    3. Predictor scores 9/10, flags sudden shift, lists related semiconductor tickers (AMD, TSM, INTC).
    4. Writer drafts original headline, 60-word summary, and why it matters.
    5. Commander applies approval policy (approves in auto mode).
    6. Publisher commits news.json as BREAKING.
    """
    logger = logging.getLogger("newsroom.demo")
    logger.info("=" * 70)
    logger.info("🎬 STARTING MULTI-AGENT NEWSROOM DEMO: NVDA CHIP EXPORT RESTRICTIONS")
    logger.info("=" * 70)

    bus = MessageBus()

    # Initialize all 6 specialized agents
    tracker = TrackerAgent(bus, config)
    verifier = VerifierAgent(bus, config)
    predictor = PredictorAgent(bus, config)
    writer = WriterAgent(bus, config)
    commander = CommanderAgent(bus, config)
    publisher = PublisherAgent(bus, config)

    if auto_approve:
        commander.approval_mode = "auto"

    # Stage 1: Tracker detects sudden shift & regulatory context
    logger.info("\n[1/6] TRACKER AGENT: Monitoring market anomalies and news feeds...")
    ticker = "NVDA"
    ref_price = 120.00
    curr_price = 112.80 # -6.0% drop
    trigger_headline = "U.S. Department of Commerce Issues Expanded Export Controls on Advanced AI Accelerators"

    shift_event = tracker.inspect_ticker_shift(
        ticker=ticker,
        current_price=curr_price,
        reference_price=ref_price,
        current_volume=95000000,
        avg_volume_20d=40000000,
        std_dev_volume=18000000,
        trigger_context=trigger_headline
    )

    # Stage 2: Verifier confirms sources (2 independent + 1 official SEC 8-K)
    logger.info("\n[2/6] VERIFIER AGENT: Cross-referencing and checking source accreditation...")
    sources_cluster = {
        "headline": trigger_headline,
        "is_official": True,
        "sources": [
            {"name": "SEC EDGAR Form 8-K Disclosure", "url": "https://www.sec.gov/edgar/searchedgar/companysearch"},
            {"name": "Reuters Technology Bureau", "url": "https://www.reuters.com/technology/nvda-export-rules-2026"},
            {"name": "Bloomberg Markets Terminal", "url": "https://www.bloomberg.com/news/articles/us-chip-rules-widened"}
        ]
    }
    is_verified, status, valid_sources = verifier.verify_candidate(sources_cluster)
    logger.info(f"Verification outcome: status='{status}', sources_verified={len(valid_sources)}")

    # Stage 3: Predictor scores impact and detects semiconductor spillovers
    logger.info("\n[3/6] PREDICTOR AGENT: Calculating impact score and market repercussions...")
    analysis = predictor.analyze_event(
        headline=trigger_headline,
        summary="Expanded export rules restrict high-performance compute shipments to key overseas regions.",
        primary_ticker=ticker,
        price_drop_pct=-6.0,
        keywords=["export controls", "chip ban"],
        status=status
    )
    logger.info(f"Impact: {analysis['impact_score']}/10 | Category: {analysis['category']} | Status: {analysis['status']}")
    logger.info(f"Affected ecosystem tickers: {analysis['tickers']}")

    # Stage 4: Writer drafts original copy (<= 60 words, XSS clean)
    logger.info("\n[4/6] WRITER AGENT: Crafting original executive briefing copy...")
    draft = writer.write_story(
        event_analysis=analysis,
        raw_context=trigger_headline,
        sources=valid_sources
    )
    logger.info(f"Headline: '{draft['headline']}'")
    logger.info(f"Summary: {draft['summary']}")
    logger.info(f"Why it matters: {draft['why_it_matters']}")

    # Stage 5: Commander reviews policy and gate
    logger.info("\n[5/6] COMMANDER AGENT: Reviewing approval policy and gatekeeper checks...")
    decision = commander.evaluate_and_approve(draft, manual_override_approved=auto_approve)
    logger.info(f"Commander Decision: action='{decision['action']}'")

    if decision["action"] != "PUBLISH":
        logger.warning(f"Story held by Commander. Reason: {decision.get('reason')}")
        return {"published": False, "decision": decision}

    # Stage 6: Publisher commits atomic feed update
    logger.info("\n[6/6] PUBLISHER AGENT: Validating schema and committing atomic release...")
    receipt = publisher.publish_story(decision["story"], dry_run=dry_run)
    logger.info(f"Publish Receipt: success={receipt.get('success')}, dry_run={receipt.get('dry_run')}")

    logger.info("\n" + "=" * 70)
    logger.info("🎯 REFERENCE SCENARIO COMPLETED SUCCESSFULLY!")
    logger.info("=" * 70)
    return receipt

def run_pipeline_cycle(
    config: Dict[str, Any],
    dry_run: bool = True
) -> None:
    """Runs one full discovery, verification, and publishing cycle."""
    logger = logging.getLogger("newsroom.cycle")
    logger.info("Starting scheduled newsroom harvest cycle...")

    bus = MessageBus()
    tracker = TrackerAgent(bus, config)
    verifier = VerifierAgent(bus, config)
    predictor = PredictorAgent(bus, config)
    writer = WriterAgent(bus, config)
    commander = CommanderAgent(bus, config)
    publisher = PublisherAgent(bus, config)

    # 1. Harvest candidates from feeds
    candidates = tracker.poll_feeds()
    logger.info(f"Cycle collected {len(candidates)} candidates.")

    # 2. Process first candidate if present
    if candidates:
        top_cand = candidates[0]
        sources_cluster = {
            "headline": top_cand["title"],
            "sources": [{"name": top_cand["source"], "url": top_cand["url"]}]
        }
        verified, status, valid_sources = verifier.verify_candidate(sources_cluster)
        if verified:
            analysis = predictor.analyze_event(
                headline=top_cand["title"],
                summary=top_cand.get("summary", ""),
                primary_ticker=top_cand["matched_tickers"][0] if top_cand["matched_tickers"] else None,
                status=status
            )
            draft = writer.write_story(analysis, top_cand["title"], valid_sources)
            decision = commander.evaluate_and_approve(draft)
            if decision["action"] == "PUBLISH":
                publisher.publish_story(decision["story"], dry_run=dry_run)

def main() -> None:
    parser = argparse.ArgumentParser(description="Titan War Multi-Agent Newsroom")
    parser.add_argument("--demo", action="store_true", help="Run the reference scenario (NVDA 6% drop & export rules)")
    parser.add_argument("--live", action="store_true", help="Publish live to data/news.json (disables dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Force dry-run mode (default)")
    parser.add_argument("--auto-approve", action="store_true", help="Set approval mode to auto (bypasses manual hold)")
    parser.add_argument("--once", action="store_true", help="Run a single live harvest cycle and exit")
    parser.add_argument("--loop", action="store_true", help="Run the continuous scheduler")
    parser.add_argument("--config", default="newsroom/config.yaml", help="Path to config.yaml")

    args = parser.parse_args()

    # Determine paths
    cfg_file = Path(args.config)
    if not cfg_file.exists():
        cfg_file = Path(__file__).parent / "config.yaml"

    config = load_config(cfg_file)
    setup_logging(config.get("app", {}).get("log_level", "INFO"))

    dry_run = not args.live

    if args.demo:
        run_reference_demo(config, dry_run=dry_run, auto_approve=True)
    elif args.once:
        run_pipeline_cycle(config, dry_run=dry_run)
    elif args.loop:
        sched = config.get("scheduling", {})
        norm_int = int(sched.get("normal_interval_seconds", 300))
        logging.info(f"Starting newsroom scheduler loop (Interval: {norm_int}s, dry_run={dry_run})...")
        while True:
            try:
                run_pipeline_cycle(config, dry_run=dry_run)
            except KeyboardInterrupt:
                logging.info("Newsroom scheduler stopped by operator.")
                break
            except Exception as e:
                logging.error(f"Error during cycle: {e}")
            time.sleep(norm_int)
    else:
        # Default when run without flags: display demo
        print("\nTitan War Multi-Agent Newsroom")
        print("Usage:")
        print("  python -m newsroom.main --demo          # Run NVDA Reference Scenario Demo")
        print("  python -m newsroom.main --demo --live   # Run Demo and commit to data/news.json")
        print("  python -m newsroom.main --once          # Run one live harvest cycle (dry-run)")
        print("  python -m newsroom.main --loop --live   # Run continuous background daemon\n")
        run_reference_demo(config, dry_run=True, auto_approve=True)

if __name__ == "__main__":
    main()
