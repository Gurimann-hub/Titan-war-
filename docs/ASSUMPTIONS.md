# JARVIS Institutional AI Platform — Engineering Assumptions Log

This document records architectural, operational, and financial assumptions pursuant to Section 0 Rule 2 of the JARVIS v2 Specification. Every assumption has an assigned owner, clear rationale, and an explicit falsification condition.

---

| ID | Category | Title & Statement | Owner | Falsification Criteria | Status |
|---|---|---|---|---|---|
| **A1** | Architecture | **Zero-Framework Node.js Core:** The running application is an asynchronous, zero-framework Node.js service (`node:http`, `node:sqlite`, CommonJS) with static front-end assets in `public/`. Python/FastAPI/Alembic components exist as optional or legacy specifications; all quantitative and agent invariants are natively enforced in Node/SQLite. | Principal Engineer | If Node.js `node:sqlite` or standard library fails to support bitemporal queries, WAL concurrency, or sub-50ms latency SLOs under load. | **ACTIVE** |
| **A2** | Storage | **Unified Data Volume:** Both containerized (`Docker`) and local environments store SQLite state under `./data/` (`data/jarvis.db`, `data/platform.db`, `data/users.xlsx`). `backend/` and `rest/` SQLite paths are aliases pointing to this single source of truth. | Principal Engineer | Any test or job demonstrating state divergence or split-brain SQLite instances across paths. | **ACTIVE** |
| **A3** | Safety & Execution | **Paper Broker & Zero Live Execution:** JARVIS is exclusively an analytics co-pilot. Live trade routing is physically absent from the core server codebase. All broker interactions in Triad degrade to `SimulatedBroker` / `PaperBroker`. | Principal Engineer | If any real broker execution SDK (Alpaca, Interactive Brokers, Zerodha) is imported or called in runtime code. | **ACTIVE** |
| **A4** | Data Integrity | **Bitemporal Fact Provenance:** Every displayed financial figure originates from a timestamped `Fact` envelope with valid `as_of`, transaction `known_at`, source tier, and quality tag. Bare ungrounded numbers are rejected. | Principal Engineer | If serializer emits financial metric without corresponding `fact_id` or provenance metadata. | **ACTIVE** |
| **A5** | Rate Limiting | **In-Process Token Bucket with Redis Upgrade Path:** In local/dev environments, token-bucket rate limiting runs in-process via `rate-limit.js`. For horizontal multi-worker deployments, Redis token buckets are engaged via `REDIS_URL`. | Principal Engineer | Multiple Node cluster instances running without Redis causing inconsistent IP bucket tracking. | **ACTIVE** |
