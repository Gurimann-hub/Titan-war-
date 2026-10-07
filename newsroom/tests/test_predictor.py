"""Unit tests for the Predictor (Analyst) Agent."""

import pytest
from newsroom.bus import MessageBus
from newsroom.agents.predictor import PredictorAgent

@pytest.fixture
def predictor_agent():
    bus = MessageBus()
    config = {
        "shift_detection": {
            "keywords": ["export controls", "chip ban", "antitrust", "earnings surprise"]
        }
    }
    return PredictorAgent(bus, config)

def test_predictor_scores_export_controls_as_high_impact(predictor_agent):
    analysis = predictor_agent.analyze_event(
        headline="Department of Commerce Expands Export Controls on AI Chips",
        summary="Strict new licensing thresholds imposed across leading compute providers.",
        primary_ticker="NVDA",
        price_drop_pct=-6.2,
        keywords=["export controls", "chip ban"],
        status="confirmed"
    )

    assert analysis["impact_score"] >= 8
    assert analysis["impact_score"] <= 10
    assert analysis["category"] == "market-shift"
    assert analysis["status"] == "breaking"
    assert "NVDA" in analysis["tickers"]
    assert "AMD" in analysis["tickers"] # Semiconductor peer cross-reference

def test_predictor_scores_routine_event_as_moderate(predictor_agent):
    analysis = predictor_agent.analyze_event(
        headline="Apple Rolls Out Minor Security Update for iOS Developers",
        summary="Annual conference patch notes release with bug fixes.",
        primary_ticker="AAPL",
        price_drop_pct=0.2,
        keywords=[],
        status="confirmed"
    )

    assert analysis["impact_score"] <= 6
    assert analysis["category"] == "big-tech"
    assert analysis["status"] == "confirmed"
    assert "AAPL" in analysis["tickers"]

def test_predictor_maps_affected_sectors(predictor_agent):
    analysis = predictor_agent.analyze_event(
        headline="Antitrust Scrutiny Mounts Over Cloud Infrastructure Deals",
        summary="Regulators examine major enterprise platform dependencies.",
        primary_ticker="MSFT",
        price_drop_pct=-1.5,
        keywords=["antitrust"],
        status="confirmed"
    )

    assert analysis["impact_score"] >= 7
    # MSFT peers must include AMZN and GOOGL
    assert "MSFT" in analysis["tickers"]
    assert "AMZN" in analysis["tickers"] or "GOOGL" in analysis["tickers"]
