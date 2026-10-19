# SOAR Desk Cloud — multitenant, AI-assisted edition

Status: **PROPOSED / NOT IMPLEMENTED** (October 17, 2026). This is an architectural decision record, not a claim of HIPAA compliance, a deployment authorization, a working billing system, or an SSA submission integration.

## Product decision

Continue shipping SOAR Desk as a local-first Tauri/Rust/React desktop application. Add a paid, organization-managed cloud service at **$49.99 per named seat monthly** or **$500 per named seat annually**. Annual billing is equivalent to about $41.67/month; the annual discount against 12 monthly payments is about 16.65%. Allow organizations to provision, invite, suspend and reassign seats with a billing ledger and reasonable anti-abuse rules; all entitlements must be resolved server-side. Existing local encrypted records must remain accessible when subscriptions expire.

The paid edition provides actual collaborative case management and AI assistance, not merely access to a remotely hosted login. Maintain an open-source community edition under AGPL-3.0-only with existing source obligations honored. Do not represent an AGPL application license as a prohibition on running, studying, modifying or redistributing licensed software.

## Trusted Google Cloud services and boundaries

- **Cloud Firestore** provides the **(default)** control-plane directory and a dedicated named database per organization (not Firebase Realtime Database). The Google Cloud HIPAA-covered services list explicitly includes Firestore. All client/case/medical data resides only in the corresponding tenant database; org membership and subscription metadata remain in (default).
- **Cloud Storage** holds encrypted medical evidence and other binary attachments; never store binaries, PDFs, SSNs, applicant names or clinical snippets in Firestore document IDs, billing metadata or URLs. Cloud KMS provides key-encryption operations and managed rotation policies.
- **Cloud Run (Rust/Axum)** is the required backend-for-frontend/API. Desktop clients do *not* directly access privileged Firestore Admin APIs. All tenant, case, seat and subscription authorization must be repeated server-side, including on list/search, blob download and AI retrieval. Service-account IAM is least-privilege; Cloud Firestore server SDKs bypass Firebase client Security Rules.
- **ZITADEL OIDC** continues as authentication. Validate issuer, audience, expiry and subject on the backend; map `iss+sub` to a stable internal user ID and verified organization membership. Do not grant membership based only on email/domain. If a Firebase SDK is ever needed, use an explicitly reviewed Identity Platform bridge and scoped tokens; do not confuse user authentication with case authorization.
- **Google Cloud Generative AI on Gemini Enterprise Agent Platform (formerly Vertex AI generative models)** handles PHI-bearing Gemini requests *only if* the BAA, chosen service/model/features, project configuration and processing region are independently verified in scope. Use an approved GA model and regional endpoint where supported, avoid undocumented preview/grounding/tool functions, and retain a no-cloud-AI option. Google AI Studio/Gemini Developer API is suitable for **synthetic-data prototyping only** unless an explicit separate contractual determination authorizes the actual PHI flow. A paid API plan or non-training promise is not a BAA.
- **Stripe Billing** collects payments for organization seats. Store only organization and subscription opaque IDs with Stripe; no claimant names, SSNs, form data or medical details in customer/payment metadata. Verify signed webhooks, enforce idempotency and maintain source-of-truth subscription events.

Do not move claimant data or send it to any new provider until a signed Google Cloud BAA where appropriate, nonprofit customer BAAs where required, architecture threat model, privacy/security impact assessment and disaster-recovery testing are complete. HIPAA status varies with the participating organizations and records; nonetheless use strict controls for all claimant data.

## Architecture / principal flows

```text
Windows 11 SOAR Desk (Tauri/Rust/React)
  local AES-GCM vault / local OCR & AI fallback / offline drafts
                 |
         ZITADEL OIDC login
                 |
    Cloud Run: SOAR Desk API (Rust/Axum)
       |              |               |
    Firestore     Cloud Storage    AI broker + policy
    default index  tenant-segmented encrypted evidence
    + org DBs         |
    seats/tasks   evidence hashes     covered Gemini API
       |              |               |
          KMS / audit / backups
                 |
    Stripe Billing -> verified webhook -> seat entitlement
```

Server AI calls require authenticated, scoped authorizations **again** and a separately logged, explicit processing action. Local encryption is *not* an end-to-end/zero-knowledge guarantee once an authorized backend decrypts case excerpts for search or Gemini: explain this clearly to customers. Minimize PHI sent to AI; don't include case text in generic telemetry, exception reports, or model selection logs.

## Tenant and case permission model

Organization roles and case roles are independent; org ownership alone does not grant all patient-level case content by default.

- `owner`: organization settings, seat allocation, BAA/contact management. Case content only if separately granted.
- `billing_admin`: invoices, seats, billing details; **no default claimant data access**.
- `org_admin`: invite/remove memberships, policy configuration, team assignment; **no automatic content access**.
- `supervisor`: oversight for explicitly scoped teams/cases; controlled access with accountability.
- `practitioner`: edit assigned cases and submit work for peer review.
- `reviewer`: review designated cases/evidence and approve/reject AI proposals under bounded privileges.
- `auditor`: independently provisioned, purpose-limited read access to approved audit records; no default medical-document download.

Per-case grants: `viewer`, `contributor`, `lead`, `reviewer`; case sharing requires verified organization membership, a legitimate service purpose, documented required disclosure/consent or authorization basis, and an audit event. Cross-organization sharing is **off** in v1. An org admin must not create an unauthorized case grant for itself simply by editing Firestore; all permissions must be mediated by Cloud Run policies.

Seat changes and case reassignment are atomic server actions where practical: revoke sessions, transfer outstanding tasks without leaking deleted memberships, preserve audit attribution and original authorship. Billing status never prevents lawful case export/continuity access.

## Firestore control plane + organization-isolated databases (decision ADR-002)

**Decision:** The Firestore **(default)** database contains the organization directory, active licensed seats, user memberships and billing metadata only. Every organization receives its **own named Firestore database instance**, not an org-specific collection in (default). All claimant, case, evidence, extracted medical, clinical review and case audit data stays in that organization's data plane.

~~~text
Firestore (default) [Control Plane]
└── Organizations/                                  # collection
    └── {organizationId}/                            # document
        ├── organizationDbId                          # named database
        ├── organizationProjectId                     # data-plane GCP project
        ├── region / status / schemaVersion
        ├── subscriptionId / plan / seatCount
        └── users/
            └── {userId}/                            # roles, seat, status, teams

Firestore ({organizationDbId}) [Organization Data Plane]
├── applicantRecords/{applicantId}
├── cases/{caseId}
│   ├── grants/{userId}
│   ├── interviews/{interviewId}
│   ├── applications/{applicationId}
│   ├── forms/{formId}
│   ├── evidence/{evidenceId}
│   ├── tasks/{taskId}
│   └── aiProposals/{proposalId}
├── providers/{providerId}
└── auditEvents/{eventId}
~~~

Client supplies only the **organization ID**. Authenticated Cloud Run resolves its database/project ID from the stored directory after verifying active organization membership and seat status, and separately verifies case/document grants **inside the organization database**. Never trust a client-provided database ID, project ID, bucket name or role claim as sufficient authorization. Org administrators and billing administrators have no default claimant access. Firestore server/Admin clients bypass client Security Rules, so backend ABAC and database-scoped least-privilege IAM are mandatory. Per-org backups, delete protection, retention and encrypted evidence storage are mandatory.

Each project supports **100 databases by default**, so route named tenant databases across multiple Inimetrica GCP data-plane projects when needed, preserving the central default directory in one control-plane project. Named databases have usage charges and **no free quota**. Cross-database transactions are not atomic: use idempotency and a saga/outbox for tenant provisioning and org workflows. The database provisioning API must be automated and gate tenant activation on isolation/security tests.

**Detailed security, lifecycle, routing, schema and scaling requirements:** [ADR-002 — Organization database isolation](ADR-002-ORG-DATABASE-ISOLATION.md).

All cross-org sharing is disallowed for v1; an explicit consent-/authorization-governed exchange is required to transfer evidence between organizations. No former ESL records or database configuration may be copied to the new instances.

## AI copilot: human-in-the-loop workflows

The paid product is a **workflow copilot**, not a clinical diagnostician, SSA adjudicator, attorney, or autonomous submitter. Design each assistant action as a versioned structured proposal with `source_id`, page/span, model/provider/version, prompt-template version, timestamp, cost/usage and reviewer state.

| Workflow | AI proposal | Human gate |
| --- | --- | --- |
| Intake interviewing | Adaptive follow-up questions and missing-data checklist | Caseworker confirms participant-reported answers |
| SSA field crosswalk | Proposed placements into precise SSA form edition/field, with confidence and source pointers | Practitioner reviews each proposed field |
| Medical evidence | Extract diagnoses, treatment history, duration and functional observations with verbatim source snippets | Practitioner checks clinical meaning, flags contradictions |
| RFC/functional impacts | Draft source-grounded functional descriptions and daily-living impacts | Human reviews; no invented diagnosis or capacity finding |
| Evidence gap detection | Missing longitudinal records, onset dates, provider contacts, work-history gaps | Practitioner chooses records to request |
| Narrative drafting | Draft evidence-linked SOAR medical summaries / personal history narratives | Human edits, signs off, exports as draft |
| Care team collaboration | Summarize case changes and open tasks for **authorized** recipients only | Reviewer approves external communication |
| Workflow planning | Reminders, next actions, handoffs and stale-case alerts | Staff assigns and completes tasks |
| Quality assurance | Identify inconsistent names, dates, work entries, records lacking citations | Human resolves discrepancies |
| Management analytics | Aggregated throughput, aged cases, missing evidence, stage duration | Privacy thresholds and no default individual health disclosures |

Require explicit labels `AI suggestion — unverified`; provide `accept / edit / reject` and reason, source snippets, and diff. Never auto-sign, submit, contact a provider, change eligibility conclusion, or send messages based solely on model output. No cross-tenant retrieval or use of one organization's cases to assist another. Prompt-injection controls must regard uploaded evidence as untrusted content.

## API sketch

```text
POST   /v1/orgs                     create organization, owner and billing account
POST   /v1/orgs/{org}/invites        invite scoped user (seat availability checked)
POST   /v1/orgs/{org}/seats          purchase/allocate or reassign a named seat
GET    /v1/orgs/{org}/entitlements   server-issued entitlement, expiry, grace
GET    /v1/orgs/{org}/cases          restricted, paginated case queue
POST   /v1/orgs/{org}/cases          initialize case
PATCH  /v1/orgs/{org}/cases/{case}   version-preconditioned state change
POST   /v1/orgs/{org}/cases/{case}/grants   bounded, auditable case share
POST   /v1/orgs/{org}/cases/{case}/evidence/initiate
POST   /v1/orgs/{org}/cases/{case}/ai/proposals    task-scoped Gemini invocation
POST   /v1/orgs/{org}/cases/{case}/ai/{proposal}/review
POST   /v1/billing/checkout          hosted Stripe checkout session
POST   /v1/billing/webhooks/stripe   raw-body signature + idempotency
```

Every endpoint uses centralized ABAC `authorize(actor, org, case, action)`, validates request bodies, enforces limits and retains a signed/append-only event. No API key in the Windows executable.

## Privacy/operational minimum

- Contract and responsibility map: SOAR Desk vendor BAA with each customer when required; Google Cloud BAA and documented provider/subprocessor inventory. Verify Stripe and identity paths never receive PHI.
- MFA, least-privilege roles, session expiration, revoked-seat behavior, device registration policy, break-glass access audited and reviewed.
- Envelope encryption, independent key lifecycle/rotation/restore, HTTPS, separate sensitive-data logging, immutable event export and retention schedule.
- Explicit tenant isolation adversarial tests on *every* list/search/download/action and AI request, including guessed document IDs.
- Region policy, backup/restore drills, incident response, vulnerability handling, secure build/signing and installer/update verification.
- Privacy-first analytics; no training/fine-tuning on customer PHI and no general Gemini API Studio prompts containing real cases.
- User disclosure: cloud AI processes authorized excerpts remotely, even though the base app is local-first. An organization can disable Gemini entirely and continue local SOAR workflows.
- Preproduction synthetic-only fixture tests until all security and contractual gates close.

## Commercial controls / unit economics

- Monthly list price `$49.99` per named active seat, charged monthly.
- Annual list price `$500` per named active seat, charged annually.
- Named seat is billable for server-managed case sharing and cloud AI; define and publish reassignments/seat counts clearly; no silent sharing of one identity.
- Avoid unlimited high-cost inference promises. Start with a transparent included cloud AI allowance, organization-level pool, per-seat usage visibility, abuse throttling, server-side cost caps and explicit opt-in for overages. Local AI can remain unrestricted by remote consumption limits.
- Model routing: deterministic form validations -> local model/cheap Gemini model for low-risk structured assistance -> capable covered Gemini model for source-heavy analysis only when requested. Confirm model pricing/availability and covered feature list at launch.
- Never put claimant PHI in Stripe checkout, invoices, payment metadata, diagnostic events or email subject lines.
- Require feature-level cost measurement and pilot data before selecting precise quota; treat `$500/year` as revenue, not proof of positive margin.

## Suggested milestones

1. Security/compliance readiness: vendor role determination, BAAs, covered service/features inventory, tenant threat model, data-flow diagrams. **Gate for real records.**
2. Organization + seat MVP: synthetic Firestore schema and emulator, Rust Axum API, ZITADEL token validation, org roles, invitation, named seat/Stripe webhooks, tenant isolation tests. No PHI in pilot.
3. Shared-case MVP: encrypted evidence in Cloud Storage, case grants and atomic audit, conflict/versioning, backup + recovery; test with fictional cases.
4. AI pilot: synthetic-only Gemini prototyping, then approved Cloud Generative AI path and server broker, cost meters, human review and source citations.
5. Windows UX: organization selector, team queues, case sharing, AI assist panel, immutable history, cloud/local connectivity states and safe exports; full pilot/security and accessibility acceptance.

## Reference sources (verify again before production)

- Google HIPAA services/controls: https://docs.cloud.google.com/docs/security/compliance/hipaa
- Google HIPAA and BAA: https://cloud.google.com/security/compliance/hipaa-compliance
- Firestore vs. Realtime Database: https://firebase.google.com/docs/database/rtdb-vs-firestore
- Firestore server authorization caveat: https://firebase.google.com/docs/firestore/solutions/role-based-access
- Gemini API/AI Studio terms: https://ai.google.dev/gemini-api/terms
- Google Cloud Generative AI data governance: https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention
- Cloud Generative AI pricing: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
- Stripe billing: https://stripe.com/billing/pricing
