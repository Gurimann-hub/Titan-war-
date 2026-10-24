# JARVIS v2 Engineering Changelog

All notable changes, architectural milestones, and verification runs are documented in this file.

---

## [Milestone M0] — Hardening & Core Integrity Invariants (October 2026)

### Added
- **Bitemporal Fact & Event Tables (`jarvis-db.js`):**
  - Created `events` table (bitemporal event-sourced log with `seq`, `event_id`, `type`, `entity`, `payload`, `occurred_at`, `known_at`).
  - Created `facts` table (provenance envelope storing `fact_id`, `entity`, `metric`, `value`, `unit`, `as_of`, `known_at`, `source`, `source_tier`, `quality`).
  - Created `kill_switch_events` table (audited emergency kill switches).
- **Immutable Append-Only Triggers (P5 Enforcement):**
  - Injected SQLite triggers (`RAISE(ABORT, ...)`) preventing `UPDATE` and `DELETE` operations on `events`, `prediction_ledger`, `weight_changelog`, and `kill_switch_events`.
- **Production Guardrail Assertion:**
  - Added strict startup validation in `server.js`: If `ENV=prod` and `MOCK_MODE=true` (or unconfigured in production), the server refuses to boot with an explicit diagnostic error.
- **REST Chat Deprecation & Post-Only Enforcement:**
  - Deprecated `GET /api/chat` to protect user prompts from access logs and proxy cache leaks. Requests return `405 Method Not Allowed` with an `Allow: POST` header unless `LEGACY_CHAT_GET=true` is explicitly provided.
- **Fact Envelope Serialization on Quote Provider:**
  - Market snapshots and quotes wrapped with `fact_id`, `source`, `source_tier`, `as_of`, and `quality` badges (`live`, `delayed`, `stale`, `mock`, `closed`).
- **Comprehensive Verification Suite (`tests/phase0.hardening.test.js`):**
  - Automated tests covering append-only triggers, production guard boot aborts, GET chat deprecation, and Fact envelope validation.
