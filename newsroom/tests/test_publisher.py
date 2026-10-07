"""Unit tests for the Publisher Agent."""

import json
from pathlib import Path
import pytest
from newsroom.bus import MessageBus
from newsroom.agents.publisher import PublisherAgent
from newsroom.schema import validate_story_dict

@pytest.fixture
def publisher_with_tmp(tmp_path):
    bus = MessageBus()
    out_file = tmp_path / "news.json"
    hist_dir = tmp_path / "history"
    config = {
        "storage": {
            "output_file": str(out_file),
            "history_dir": str(hist_dir),
            "max_history_backups": 5
        },
        "publisher": {
            "method": "file"
        }
    }
    agent = PublisherAgent(bus, config)
    # Direct paths to tmp_path
    agent.output_file = out_file
    agent.history_dir = hist_dir
    return agent, out_file, hist_dir

def test_schema_validator_catches_invalid_inputs():
    valid_story = {
        "id": "news_12345",
        "slug": "nvda-export-rules",
        "headline": "Commerce Dept Expands Restrictions on High-End AI Chips",
        "summary": "New regulatory guidelines target AI accelerator sales across international borders.",
        "why_it_matters": "Direct impact on GPU revenue guidance and key foundry orders.",
        "category": "market-shift",
        "companies": ["NVIDIA Corporation"],
        "tickers": ["NVDA", "AMD"],
        "impact_score": 9,
        "status": "breaking",
        "sources": [{"name": "SEC", "url": "https://sec.gov/filing"}],
        "published_at": "2026-10-07T12:00:00Z"
    }

    is_valid, errors = validate_story_dict(valid_story)
    assert is_valid is True
    assert len(errors) == 0

    # Test summary exceeding 60 words
    long_story = dict(valid_story)
    long_story["summary"] = "word " * 65
    is_valid, errors = validate_story_dict(long_story)
    assert is_valid is False
    assert any("exceeds 60 words" in e for e in errors)

    # Test invalid category
    bad_cat = dict(valid_story)
    bad_cat["category"] = "unsupported-category"
    is_valid, errors = validate_story_dict(bad_cat)
    assert is_valid is False

def test_publisher_atomic_write_and_history_rotation(publisher_with_tmp):
    agent, out_file, hist_dir = publisher_with_tmp

    sample_story = {
        "id": "news_init",
        "slug": "test-story",
        "headline": "Test Headline",
        "summary": "Short summary under sixty words.",
        "why_it_matters": "Clear market implication.",
        "category": "big-tech",
        "companies": ["Apple"],
        "tickers": ["AAPL"],
        "impact_score": 5,
        "status": "confirmed",
        "sources": [{"name": "Reuters", "url": "https://reuters.com/news"}],
        "published_at": "2026-10-07T12:00:00Z"
    }

    # First write (live)
    receipt_1 = agent.publish_story(sample_story, dry_run=False)
    assert receipt_1["success"] is True
    assert out_file.exists()

    with open(out_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        assert data["metadata"]["disclaimer"] == "AI estimate, not financial advice"
        assert len(data["stories"]) == 1

    # Perform multiple updates to trigger history backup and prune
    for i in range(8):
        update_story = dict(sample_story)
        update_story["id"] = f"news_update_{i}"
        update_story["slug"] = f"test-update-{i}"
        agent.publish_story(update_story, dry_run=False)

    # Check history rotation: max_history_backups is set to 5
    backups = list(hist_dir.glob("news_*.json"))
    assert len(backups) <= 5
