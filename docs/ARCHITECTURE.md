# Architecture (initial decision record)

## Choice
Local-first Windows desktop using Tauri 2 (Rust) with React/TypeScript UI. Platform-independent Rust domain crates contain the SSA/SOAR-related logic. Future optional nonprofit self-hosted service can reuse these crates with a server API.

## Planned layers
1. `soar-core` — evidence-status and case domain types, neutral triage primitives.
2. `soar-workflow` — versioned, sourced, configurable workflow rules.
3. `soar-storage` — interfaces for SQLite-based local storage, schema migrations.
4. `soar-documents` — encrypted vault and provenance-aware evidence exports.
5. `apps/desktop` — Tauri desktop shell; UI may not bypass domain validation.
6. `apps/server` (future) — authenticated API and tenant isolation.

## Security gates before handling production data
- Threat model and approved data classification.
- Authenticated user, automatic lock, OS security assumptions, least privilege.
- Encryption at rest for database, attachments, backups, and temporary files.
- Secure secrets/key lifecycle, permission boundaries, tamper-evident audit trail.
- Retention and incident-response procedures; restore-tested backups.
- Accessibility and security reviews; organizational deployment approval.

## Rules engine
Every actionable rule records: originating authority, citation/URL, effective date, review date, jurisdiction, whether binding or recommended, and an agency override policy. Never confuse internal SOAR targets with SSA statutory/regulatory deadlines.

## Note
The initial Rust crate has no persistence or encryption. It is a **non-production prototype**; storing real client records is prohibited.
