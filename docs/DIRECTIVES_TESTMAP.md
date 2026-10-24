# JARVIS Prime Directives — Enforcement & Verification Matrix

Pursuant to Section 1 & Section 18 of the JARVIS v2 Specification, the Prime Directives are non-negotiable invariants enforced across code, database schemas, API serializers, and automated tests.

---

| # | Directive | Enforcement Mechanism | Verification Test |
|---|---|---|---|
| **P1** | **No live execution from JARVIS** | Core runtime is an analytics co-pilot. Triad is locked to `SimulatedBroker`. No broker execution SDKs imported. | `tests/phase4.bot.test.js`, `tests/security.test.js` |
| **P2** | **Truth over fluency** | `Fact` envelope with provenance (`fact_id`, `metric`, `value`, `unit`, `as_of`, `known_at`, `source`, `source_tier`, `quality`). Serializer rejects ungrounded numbers. | `tests/jarvis-and-news.test.js`, `tests/phase0.hardening.test.js` |
| **P3** | **No look-ahead, ever** | Bitemporal schema (`events`, `facts`) with strict `known_at <= T` time-travel query filtering. | `tests/phase0.hardening.test.js` |
| **P4** | **Calibrated or silent** | Uncalibrated probabilities masked or labeled with `UNCALIBRATED` badge. `calibrated` boolean required for numeric probability display. | `tests/phase4.jarvis.test.js`, `tests/jarvis-and-news.test.js` |
| **P5** | **The record is immutable** | SQLite database triggers (`RAISE(ABORT, ...)`) forbid `UPDATE` and `DELETE` on `events`, `prediction_ledger`, `weight_changelog`, `kill_switch_events`. | `tests/phase0.hardening.test.js` |
| **P6** | **LLMs propose, code disposes** | Pydantic / JSON schema validator, deterministic `RiskGuard` position caps (10% max weight, 2% drawdown). LLM cannot bypass code gates. | `tests/phase4.bot.test.js`, `tests/phase4.jarvis.test.js` |
| **P7** | **All external text is hostile** | Untrusted content envelope, XML external entity (XXE) and SSRF protection on news feeds, prompt injection sanitization. | `tests/phase3.news.test.js`, `tests/security.test.js` |
| **P8** | **Fail closed** | Stale, missing, or tripped breaker data defaults to `ABSTAIN` / `HOLD`, never to a hallucinated market prediction. | `tests/phase2.news-engine.test.js`, `tests/phase4.bot.test.js` |
| **P9** | **Reproducibility** | Every forecast and ledger row snapshots `weights_snapshot`, `dominant_driver`, `input_signals`, and version timestamps. | `tests/phase4.jarvis.test.js` |
| **P10** | **Budgets are features** | Token-bucket rate limiting on chat endpoints, sliding window quotas, and circuit breakers. | `tests/phase4.jarvis.test.js`, `tests/phase0.hardening.test.js` |
| **P11** | **Show uncertainty, not just answers** | Conformal interval / confidence bands (`predicted_range_low`, `predicted_range_high`) emitted with every growth score. | `tests/jarvis-and-news.test.js`, `tests/phase4.jarvis.test.js` |
| **P12** | **Humans promote, machines propose** | Model promotion requires explicit human record in `weight_changelog` and `model_registry`; auto-promotion disabled in prod. | `tests/phase4.jarvis.test.js` |
| **P13** | **User customization cannot lower safety** | Prompt slots and user style preferences cannot override disclaimer stamp, position sizing caps, or immutable audit logging. | `tests/phase4.jarvis.test.js`, `tests/security.test.js` |
