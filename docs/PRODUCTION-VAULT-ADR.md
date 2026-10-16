# SOAR Desk production data architecture — proposed ADR 0002

**Status: nonprofit single-practitioner deployment AND organizational recovery authority approved; cryptographic implementation, recovery ceremony, and sync remain proposed, not deployed.** 2026-10-16. The live desktop app remains a fictional-data prototype. The repo now includes a Rust `soar-storage` domain boundary and schema v1. There is **no disk adapter and no permission to enter real PII/PHI**.

## Goals and trust assumptions

1. Local-first intake and offline clinical evidence work, including full SSI/SSDI applications and documents that may contain SSNs, diagnosis, medications, dates of birth, homelessness, financial resources and protected case histories.
2. One canonical applicant/case source of truth with versioned federal form snapshots, separate original immutable evidence and derived human-reviewed assertions.
3. Separation among user identities, reviewer roles, case access and organization/workspace data.
4. Portable backups and case handoff that do not expose unencrypted files or embedded subject identities.
5. Optional future nonprofit/server deployments without coupling local architecture to SSA/third-party APIs.

Do NOT assume every SOAR provider is a HIPAA covered entity or business associate: determine legal classification and contracts **per deployment**. Regardless, use HIPAA-equivalent confidentiality, integrity, authentication and audit expectations. An organizational risk assessment and business associate agreements (where required) are deployment prerequisites.

## Recommended operational format

**Recommend a single encrypted local vault per organization/workspace, not one editable JSON file per client.**

```text
%LOCALAPPDATA%/SOAR Desk/Vaults/<random-vault-id>/
  vault.db                  # SQLCipher encrypted SQLite database; all canonical structured data
  blobs/<random-blob-id>    # Independently authenticated encrypted document ciphertext
  vault-header.json         # Minimum NON-personal crypto metadata and schema version
  backups/                  # Only encrypted, authenticated application-managed backups
```

- Store **canonical answers** as structured records in the SQLCipher database: case ID, form/version/question, typed value, as-of date, provenance, reviewer state, human assertions, timestamps.
- Store **PDF and medical source documents** as immutable versioned encrypted attachments, NOT as base64 inside JSON. Records link blob ID, source SHA-256, encryption key version, content type and event history.
- Keep each form template's official edition + SHA-256 and binding contract distinct from the generated report and the applicant's answers.
- Never store SSN/name in file paths, exported filenames by default, document indexing paths, log output, telemetry, or unencrypted temporary data.
- Preserve original clinical evidence; only store derived Qwen/Laya findings as **unverified proposals**, with passage references and a separate human verification event.
- Case deletion is an authorized, audited workflow with legal hold and organization retention policy, not a casual OS recycle-bin operation.

### Why SQLCipher rather than SQLite alone

Stock SQLite, even on a BitLocker device, is insufficient as the sole protection for portable case data. SQLCipher provides transparent page encryption and integrity protections for database pages; we must verify its configuration, WAL/temp behavior and restore semantics on Windows ARM64. The database key comes from the vault key hierarchy, **not** a literal in code or environment variable.

**A synthetic-only, AES-GCM sealed JSON case prototype now exists (see [ENCRYPTED-VAULT-PROTOTYPE.md](ENCRYPTED-VAULT-PROTOTYPE.md)); it does not replace SQLCipher. No SQLCipher dependency is linked in the application yet.** Merely adding `soar-storage/migrations/0001_initial.sql` does not create an encrypted database. The migration is deliberately unusable with any enabled production file-writing path until SQLCipher, OS key management and RBAC are integrated and tested.

## Keys, authentication, unlock and recovery

Proposed hierarchy:

- **Vault Master Key (VMK)**: generated from operating-system CSPRNG, never derived directly from a username or biometric measurement; key material kept out of React/JS logs and plaintext files.
- **DB encryption key**: derived using a domain-separated KDF from VMK or held as independent cryptographic material inside wrapped key metadata. Decide SQLCipher raw-key provisioning and lock/rekey lifecycle before implementing.
- **Document encryption**: individually randomized keys or nonce spaces per blob, authenticated encryption (prefer proven AES-256-GCM implementation) with integrity of entire document and any streaming chunks; authenticate case/blob IDs and content metadata as associated data.
- **Key Wrapping Key (KEK)**: prefer Windows CNG/DPAPI-backed secret protection for device-bound user unlock, with an explicitly chosen **independent recovery mechanism** (Argon2id-derived recovery KEK and separate recovery secret or admin escrow). Windows Hello may ease unlock but must not be the only way to recover data.
- **Organization mode**: principal identities and case grants; changing an organization's staff list must not force rotating every historical document one by one. For shared access, document admin recovery/escrow and who can decrypt, reset, revoke and recover.
- Strong application lock/idle timeout; lock on screen/session change; avoid keys in saved crash dumps and clear decrypted buffers where feasible.
- **Never design facial biometrics, password hashes or a unique face vector as an encryption key**. Device OS biometric auth may authorize use of a random wrapped key.
- Plan key rotation, lost password/device recovery, departing employee revocation, revocation's limits on previously exported copies, and migration to a new device **before enabling production data**.

Cryptographic primitives and configuration must be approved by a security reviewer. Argon2id is an appropriate *password-based KEK derivation* option for non-FIPS deployments; verify compliance requirements before selecting primitives. Do not design proprietary crypto.

## Application format vs transfer format

Recommend distinguishing:

1. **Working vault**: encrypted SQLCipher database + encrypted blobs, optimized for concurrent changes, recovery and transactional integrity.
2. **Portable case handoff** (`.soarcase`, a proposed extension only): a sealed, versioned encrypted package with encrypted manifest/selected case documents and a minimal non-identifying header, explicitly addressed to a recipient key or recovered via a separately conveyed passphrase. No automatic export of every field. Define later.
3. **SSA output**: unaltered official federal PDFs populated only from reviewed data, released as an explicit human-controlled action; not the application's editable internal data format.
4. **Interoperability**: minimal, explicitly authorized human-reviewed import/export in JSON/FHIR where semantically applicable; neither raw unencrypted JSON nor federal PDFs are the case database.

The exported synthetic JSON draft is a development diagnostic, not the permanent production format.

## Data and security boundaries

- Native Tauri/Rust enforces all authorization and talks to SQLCipher and the authenticated blob store; React never gets a database key or unrestricted filesystem permission.
- Role policy enforced **on every command**, including search, list, read, edit, PDF output, evidence inference, and export.
- Model host restricted to loopback, no remote fallback, no PHI in model prompts/logs, and no storing prompts on disk unencrypted. Current WSL2/GenieX prototype is **not production authorized**.
- Imported PDF handling: malware/size limits, sanitized filenames, document hashing, OCR in bounded sandbox/process, no unencrypted intermediates or path traversal, prompt-injection controls for derived model proposals.
- Database journaling/WAL, temp SQLite pages, OS thumbnail caching, downloaded reports, previews, logs, swap, crash dumps, printing spool and Windows Search/OneDrive sync must be threat-modeled before production.
- Signed/tamper-evident auditing needs more than an SQL `UPDATE` trigger. Schema v1 has protective triggers but **no authenticated event chain** yet. Append/verify using keyed hashing, trusted actor/time attribution, and periodic independent anchoring; audit events should not themselves contain PHI.
- Offline encrypted backup with restore drill, recovery codes, schema migration, verify checksum after restore. Offline does not mean single-point-of-failure backups.

## Minimum v1 relational tables already scaffolded

`vault_metadata`, `schema_migrations`, `principals`, `roles`, `principal_roles`, `cases`, `case_access`, `case_programs`, `form_instances`, `field_answers`, `evidence_sources`, `blob_metadata`, `evidence_documents`, `submitted_packets`, `audit_events`.

The field table contains per-instance form IDs, edition, answer state, assertion source and evidence association. The **source SSN and demographic data currently shown in the React interview still exist in unencrypted process memory**: this is not a finished secure local client implementation.

## Organizational recovery: approved governance requirement (implementation pending)

This policy answers the question **who may authorize restoration**; it does not determine cryptographic implementation and does not mean a nonprofit administrator can casually browse case files.

1. **Enrollment:** the nonprofit designates the active SOAR practitioner and a *different* organizational recovery custodian; create separate daily unlock and organizational recovery key-wrapping slots against a random vault master key. The custodian's recovery capability must survive loss of the employee's Windows account or original machine.
2. **Routine operation:** the practitioner unlocks and uses only their assigned local role. Custodian membership does not grant normal case-listing, search, export, decryption or evidence-review privileges.
3. **Recovery incident:** a custodian documents the reason (lost device, disabled account, employee departure, disaster), verifies authorization through an organization-approved identity procedure, and invokes a dedicated recovery flow. Recovery produces an audit event with purpose and actor, never a silent bypass.
4. **Reassignment:** on successful vault restoration, establish an explicit new practitioner's unlock slot, invalidate the superseded credential where feasible, assess whether key rotation or re-encryption is needed, and verify least-privilege case grants.
5. **Backups:** the organization restores both encrypted database and encrypted attachments, verifying integrity, key version, and recoverability. Encrypted backups and recovery materials must not be in the same single failure domain.
6. **Governance still open:** whether one designated custodian can approve an emergency, whether dual-control is required, how recovery secrets are physically stored, which cryptographic wrapping primitive is acceptable, and retention/incident-response rules.

The `soar-storage::recovery` module still implements **metadata-only governance validation**. A separate experimental `soar-storage::sealed_vault` module now implements two Argon2id-wrapped slots around a random AES-256-GCM VMK for **synthetic standalone JSON snapshots** (not SQLCipher). It can rekey into a separate file without returning contents through the recovery UI, but lacks independently signed audit, OS-keystore credential management, real-organization identity checks and production authorization. See [ENCRYPTED-VAULT-PROTOTYPE.md](ENCRYPTED-VAULT-PROTOTYPE.md).

## Release gates (fail closed, no real-case switch before all pass)

- [ ] Confirm deployment responsibility, HIPAA/contract/SSA constraints, case retention and staff roles.
- [ ] Native Windows ARM64 packaging and OS security baseline (no WSL development deployment for PHI).
- [ ] SQLCipher database setup, encrypted WAL/temp and migration test; reject plaintext database opens. (The synthetic sealed JSON vault prototype does not fulfill this.)
- [ ] CSPRNG key generation, OS-backed wrapping and documented recovery/rotation path.
- [ ] Authenticated AES-GCM attachment storage plus path, nonce, truncation and tampering tests.
- [ ] Native desktop identity, role-based access and per-case permissions with negative tests.
- [ ] Audited, timestamped human verification and append-only events, immutable/export-safe legal history.
- [ ] Safe PDF import/OCR/LLM sandboxing, no uncontrolled plaintext intermediates or telemetry.
- [ ] Real storage and encrypted backups, file locks, restore and device-loss tests.
- [ ] Full SSA form mapping and Acrobat visual/edition acceptance tests, no signature fabrication.
- [ ] Threat model, penetration/security assessment, accessibility test, organization deployment approval.

### Single-practitioner nonprofit deployment profile (adopted scope)

- **Primary client:** nonprofit SOAR provider, typically operating with one named practitioner using a local-first Windows desktop.
- **Custody:** one organization-owned vault, distinct from its operator's personal account; transfers, retention and destruction remain subject to organization policy.
- **Account model:** one routine case operator in the first release; reserve roles for a separately authenticated, explicitly authorized recovery custodian and a future replacement practitioner, without implementing a multiuser collaboration server.
- **Recovery: approved organizational authority.** The nonprofit retains an independently protected recovery capability separate from the daily practitioner's credentials. A specifically designated custodian can conduct emergency restoration under a documented, auditable process; this does **not** confer routine browse access. Custodian appointment process, dual-control policy and cryptographic escrow method still need review.
- **Sync:** offline-first single-device by default; optional future organization-managed encrypted sync is a separate product milestone requiring multi-device conflict and revocation controls.
- **Backups:** encrypted, tested restorability, and organization-controlled continuity through staff transitions; never depend solely on a departed practitioner's personal Windows profile or a single device-bound key.
- **Handoff:** versioned, purpose-limited encrypted `.soarcase` format is proposed; no handoff exporter exists yet.
- **Security invariant:** no real-client switch until authentication, SQLCipher, blob encryption, consent enforcement, audit and restore testing exist.

## Decisions needed before implementing encrypted production persistence

**D1 — Users and case custody: RESOLVED (user guidance 2026-10-16).** Deploy primarily to **nonprofit organizations with one routine SOAR Desk practitioner per organization**. Ownership/custody stays with the organization; day-to-day operations stay with the practitioner. No hosted multi-tenant backend or routine user directory is required for v1. Preserve separate `organization_id`, `vault_id`, `principal_id` and access rules in persistent records to support later staff turnover or expansion without moving cases into a new database. Do not equate the sole operator with unrestricted ownership of the vault or its recovery secrets.

**D2 — Sync:** (A) offline standalone device only; (B) optional nonprofit-managed encrypted sync; (C) centrally hosted multi-user app. **Recommended: A first, design interfaces for B.**

**D3 — Recovery: RESOLVED (user guidance 2026-10-16).** The nonprofit retains **organizational recovery authority** independently of the sole practitioner's Windows profile, password or device. Implement separate practitioner and organizational VMK-wrapping slots, an explicit recovery and reassignment event, and no default administrator read access. The specific custody mechanism (offline recovery kit vs audited organizational escrow), number of approvers, identity checks and emergency workflow remain engineering/governance choices subject to security review.

**D4 — Compatibility and compliance:** Windows-native first vs cross-platform; specify whether any employer/covered-entity mandate requires FIPS validated crypto implementation, MDM, SSO/Entra ID or centralized audit. This determines viable libraries and deployment packaging.

These are architectural choices, **not** already implemented features.

### Sources for review

- https://www.zetetic.net/sqlcipher/ — SQLCipher documentation.
- https://github.com/sqlcipher/sqlcipher — source/licensing/compatibility.
- https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
