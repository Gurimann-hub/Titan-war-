"""End-to-end automated test for the Reference Scenario:

NVDA falls 6% in 20 minutes while a headline about new chip export rules appears.
Tracker detects it -> Verifier confirms with 2 sources + 1 filing ->
Predictor scores 9/10 and lists related tickers -> Writer drafts the story ->
Commander applies approval policy -> Publisher updates news.json as BREAKING.
"""

import json
from pathlib import Path
import pytest
from newsroom.bus import MessageBus
from newsroom.agents.tracker import TrackerAgent
from newsroom.agents.verifier import VerifierAgent
from newsroom.agents.predictor import PredictorAgent
from newsroom.agents.writer import WriterAgent
from newsroom.agents.commander import CommanderAgent
from newsroom.agents.publisher import PublisherAgent
from newsroom.schema import count_words

@pytest.fixture
def end_to_end_env(tmp_path):
    out_file = tmp_path / "news.json"
    hist_dir = tmp_path / "history"
    config = {
        "app": {
            "name": "Test Newsroom",
            "approval_mode": "auto",
            "dry_run": False,
            "kill_switch": False
        },
        "storage": {
            "output_file": str(out_file),
            "history_dir": str(hist_dir),
            "max_history_backups": 20
        },
        "publisher": {
            "method": "file"
        },
        "shift_detection": {
            "price_change_pct": 4.0,
            "window_minutes": 20,
            "volume_std_dev": 2.5,
            "keywords": ["export controls", "chip ban", "national security"]
        },
        "verifier": {
            "official_source_domains": ["sec.gov", "edgar.sec.gov"],
            "allowed_press_domains": ["reuters.com", "bloomberg.com"]
        },
        "writer": {
            "llm_provider": "template",
            "max_summary_words": 60
        }
    }

    bus = MessageBus()
    tracker = TrackerAgent(bus, config)
    verifier = VerifierAgent(bus, config)
    predictor = PredictorAgent(bus, config)
    writer = WriterAgent(bus, config)
    commander = CommanderAgent(bus, config)
    publisher = PublisherAgent(bus, config)

    # Point publisher to tmp_path
    publisher.output_file = out_file
    publisher.history_dir = hist_dir

    return {
        "bus": bus,
        "tracker": tracker,
        "verifier": verifier,
        "predictor": predictor,
        "writer": writer,
        "commander": commander,
        "publisher": publisher,
        "out_file": out_file
    }

def test_nvda_export_controls_reference_scenario(end_to_end_env):
    env = end_to_end_env
    tracker = env["tracker"]
    verifier = env["verifier"]
    predictor = env["predictor"]
    writer = env["writer"]
    commander = env["commander"]
    publisher = env["publisher"]
    out_file = env["out_file"]

    # Step 1: Tracker detects market anomaly (-6% in 20 min) and export controls context
    shift = tracker.inspect_ticker_shift(
        ticker="NVDA",
        current_price=112.80,
        reference_price=120.00, # -6.0% drop
        current_volume=95000000,
        avg_volume_20d=40000000,
        std_dev_volume=18000000,
        trigger_context="Department of Commerce Expands Export Controls on Advanced AI Accelerators"
    )
    assert shift is not None
    assert shift["is_price_shift"] is True
    assert shift["price_change_pct"] == -6.0
    assert "export controls" in shift["matched_keywords"]

    # Step 2: Verifier confirms with 2 independent sources + 1 official SEC filing
    sources_cluster = {
        "headline": "Department of Commerce Expands Export Controls on Advanced AI Accelerators",
        "is_official": True,
        "sources": [
            {"name": "SEC EDGAR Form 8-K Disclosure", "url": "https://www.sec.gov/edgar/data/1045810/nvda-8k"},
            {"name": "Reuters Technology Bureau", "url": "https://www.reuters.com/tech/chip-ban-expanded"},
            {"name": "Bloomberg Terminal", "url": "https://www.bloomberg.com/news/chip-export-rules"}
        ]
    }
    is_verified, status, valid_sources = verifier.verify_candidate(sources_cluster)
    assert is_verified is True
    assert status == "confirmed"
    assert len(valid_sources) == 3

    # Step 3: Predictor scores impact 9/10, lists related tickers, flags BREAKING
    analysis = predictor.analyze_event(
        headline=sources_cluster["headline"],
        summary="Strict new licensing thresholds imposed across leading compute providers.",
        primary_ticker="NVDA",
        price_drop_pct=shift["price_change_pct"],
        keywords=shift["matched_keywords"],
        status=status
    )
    assert analysis["impact_score"] == 9
    assert analysis["status"] == "breaking"
    assert "NVDA" in analysis["tickers"]
    assert "AMD" in analysis["tickers"] # Related peer listed

    # Step 4: Writer drafts original headline, summary <= 60 words, why it matters
    draft = writer.write_story(analysis, sources_cluster["headline"], valid_sources)
    assert draft["headline"] != sources_cluster["headline"] # Must be original!
    assert count_words(draft["summary"]) <= 60
    assert len(draft["why_it_matters"]) > 10

    # Step 5: Commander reviews and approves policy
    decision = commander.evaluate_and_approve(draft, manual_override_approved=True)
    assert decision["action"] == "PUBLISH"

    # Step 6: Publisher updates data/news.json atomically with BREAKING status
    receipt = publisher.publish_story(decision["story"], dry_run=False)
    assert receipt["success"] is True
    assert out_file.exists()

    with open(out_file, "r", encoding="utf-8") as f:
        feed = json.load(f)
        assert feed["metadata"]["disclaimer"] == "AI estimate, not financial advice"
        assert len(feed["stories"]) == 1
        published_story = feed["stories"][0]
        assert published_story["status"] == "breaking"
        assert published_story["impact_score"] == 9
        assert published_story["tickers"] == ["NVDA", "AMD", "TSM", "INTC"]
        assert len(published_story["sources"]) == 3
