"""Unit tests for the Verifier Agent."""

import pytest
from newsroom.bus import MessageBus
from newsroom.agents.verifier import VerifierAgent

@pytest.fixture
def test_config():
    return {
        "verifier": {
            "official_source_domains": ["sec.gov", "prnewswire.com", "investor.nvidia.com"],
            "allowed_press_domains": ["reuters.com", "bloomberg.com", "wsj.com", "cnbc.com"]
        }
    }

def test_verifier_confirms_with_official_source(test_config):
    bus = MessageBus()
    verifier = VerifierAgent(bus, test_config)

    cluster = {
        "headline": "NVIDIA Files Form 8-K Disclosing Regulatory Assessment",
        "is_official": True,
        "sources": [
            {"name": "SEC EDGAR Form 8-K", "url": "https://www.sec.gov/edgar/data/1045810/000104581026000001"}
        ]
    }

    is_verified, status, sources = verifier.verify_candidate(cluster)
    assert is_verified is True
    assert status == "confirmed"
    assert len(sources) == 1

def test_verifier_confirms_with_two_independent_press_sources(test_config):
    bus = MessageBus()
    verifier = VerifierAgent(bus, test_config)

    cluster = {
        "headline": "Major Cloud Providers Expand Infrastructure Contracts",
        "sources": [
            {"name": "Reuters Business", "url": "https://www.reuters.com/technology/cloud-contracts-2026"},
            {"name": "Bloomberg Markets", "url": "https://www.bloomberg.com/news/cloud-spend-surge"}
        ]
    }

    is_verified, status, sources = verifier.verify_candidate(cluster)
    assert is_verified is True
    assert status == "confirmed"
    assert len(sources) == 2

def test_verifier_marks_single_source_as_developing(test_config):
    bus = MessageBus()
    verifier = VerifierAgent(bus, test_config)

    cluster = {
        "headline": "Unconfirmed Reorganization Plan Circulates at Tech Giant",
        "sources": [
            {"name": "Reuters Tech", "url": "https://www.reuters.com/tech/rumor-restructuring"}
        ]
    }

    is_verified, status, sources = verifier.verify_candidate(cluster)
    assert is_verified is True
    assert status == "developing"

def test_verifier_rejects_unverified_rumor(test_config):
    bus = MessageBus()
    verifier = VerifierAgent(bus, test_config)

    cluster = {
        "headline": "Anonymous Forum Claims Impending Hostile Takeover",
        "sources": []
    }

    is_verified, status, sources = verifier.verify_candidate(cluster)
    assert is_verified is False
    assert status == "rejected"
    assert len(sources) == 0

def test_verifier_deduplication(test_config):
    bus = MessageBus()
    verifier = VerifierAgent(bus, test_config)

    cluster = {
        "headline": "Tech Giant Announces 10,000 Global Layoffs",
        "sources": [
            {"name": "Reuters", "url": "https://www.reuters.com/article/layoffs-1"}
        ]
    }

    accepted_1, _, _ = verifier.verify_candidate(cluster)
    assert accepted_1 is True

    # Second submission of identical headline must be rejected as duplicate
    accepted_2, status_2, _ = verifier.verify_candidate(cluster)
    assert accepted_2 is False
    assert status_2 == "rejected"
