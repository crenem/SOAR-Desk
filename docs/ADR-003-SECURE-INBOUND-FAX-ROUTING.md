# ADR-003 — Zero-Trust Inbound Fax Intake, Routing and Disclosure Controls

**Decision:** Adopted architectural requirement · **Date:** 2026-10-19 · **Implementation:** Planned, NOT deployed or approved for PHI.  
**Owner:** Inimetrica Operational Systems, LLC · **Depends on:** [ADR-002 — Dedicated Organization Databases](ADR-002-ORG-DATABASE-ISOLATION.md)

## Core safety invariant

**Never allow an AI prediction, sender fax number, OCR-extracted name, or returned cover sheet alone to move protected data into a client's case.** Every inbound fax enters encrypted restricted intake first. For the **initial commercial release, automatic case assignment is disabled**: after deterministic checks, an authorized human must verify **each document/page group** and approve attachment to a specific case. Any uncertainty is **held in quarantine for purpose-limited human review or retransmission**. Consider automation only as a future, separately assessed change with measured accuracy and approvals. No cross-organization routing of payloads without controlled, audited, separately approved disclosure.

No product can guarantee that providers never misdial a number, send the wrong patient chart, or combine patients in one fax. The security objective is fail-closed automatic assignment, strict containment, transparent provenance and prompt incident response—not a claim of absolute zero incidents or 100% auto-routing.

## Security and privacy trust boundaries

~~~text
Medical provider fax
    |
    v
BAA-vetted fax service / dedicated inbound numbers
    |
    v
HTTPS callback gateway (authenticity, source API verification, idempotency)
    |
    v
Encrypted RESTRICTED fax intake (not a live case)
    |
    +-- destination fax DID resolves to org routing binding? -- NO --> global security quarantine
    |                                                               (no org-user access)
    |
    +-- YES --> org-specific restricted intake bucket / queue
                    |
                    +--> virus/file integrity/page count/duplicate checks
                    +--> in-scope OCR/AI may extract CANDIDATE clues only
                    +--> exact case request token + patient identity corroboration
                    +--> request authorization + recipient/grant checks
                    |
                    +-- ANY ambiguity/failure --> restricted org intake review
                    |
                    +-- verified single-patient/single-request match -->
                         audited atomic case-assignment record +
                         org-named Firestore case/evidence metadata +
                         org-specific encrypted evidence storage
~~~

A dedicated inbound fax number **per organization** should be the default contractual service option. This is a tenant-routing constraint, **not** proof that the sender was authorized or the attached medical records relate to that tenant. A higher-security optional temporary per-case number can narrow routing, but its cost and lifecycle/reassignment must be evaluated; even with a per-case DID, identity checks remain mandatory.

The existing Firestore (default) control plane may hold **opaque organization ID → assigned inbound fax number mapping**, fax service contract state and routing configuration; it **must not** store fax PDFs, claimant names, phone+medical correlations, clinical text, OCR findings or exception queues. When destination number cannot be authoritatively resolved, use a separate high-security restricted quarantine service/storage outside (default), managed by limited privacy-response staff with audited access. Do not deposit uncertain documents in the nearest plausible tenant.

## Outbound record-request preparation (prevents inbound ambiguity)

1. Each outbound request receives a **cryptographically random, opaque case-request correlation ID**, organization ID, bound applicant ID and treatment-provider ID *stored privately in the organization's own named DB*; include a short opaque reference and optional machine-readable code on a separate request cover page, not PHI-rich barcode.
2. State precisely the verified organization-specific return fax DID on the cover page. The provider's response may omit or alter the cover page; never assume it remains present.
3. Apply a strict recipient fax-number confirmation policy for outgoing PHI; check trusted directory/source or out-of-band confirmation, especially first-time recipients and changed fax numbers. Require operator approval for sending authorization/PHI packages. Record consent scope and recipient.
4. Mark request as pending/sent/received/partially_received/verified/closed with expected provider, time range, forms and expiry. Any reference alias must expire or be explicitly renewed; never reuse reference IDs across patients or organizations.
5. Do not treat SSA-827 (SSA/DDS authorization) as a general release to Inimetrica or a law firm; obtain applicable, valid disclosures/authorizations for the actual recipient and purpose.

## Inbound transport and integrity verification

- Validate webhook origin using the chosen vendor's **actual documented authentication method**, replay controls and source/tenant identity; **do not invent a webhook-signature feature** a vendor may not have. Retrieve the fax independently through the vendor's authenticated HTTPS API using a unique provider message ID and independently confirm assigned receiving number, page count and status from the service.
- Handle webhook retries and API eventual consistency using an immutable provider message ID + receiving number idempotency key. Duplicate arrival may update delivery status but cannot create another case assignment or overwrite evidence.
- Store the raw, unmodified fax as an encrypted immutable intake object with SHA-256, media type, page count, source event, time received, vendor account/number ID, encrypted storage location, and content-processing status. Use threat-scanned, safely parsed copies; isolate damaged, incomplete and encrypted/unsupported PDFs.
- Fax sender ID, Caller ID/CSID, OCR, barcodes, handwriting, page title, metadata and even sending-provider return number are **untrusted routing evidence**. Sender fax numbers may be shared, spoofed, reused or entered incorrectly. A barcode/reference is a routing hint, not proof of identity or consent.
- Verify fax vendor and every subcontractor handling PHI has appropriate written contracts including BAA when required; audit data retention and administrative access. Do not allow unapproved OCR/LLM/logging services to see inbound raw PHI.
- A single fax can contain multiple patients and documents. Detect possible boundaries/patient-identifier conflicts, quarantine entire transmission and require approved splitting/assignment by authorized reviewers; never route pages independently solely based on AI scores.

## Routing decision policy

**Organization gate (deterministic):**
- Use authenticated service facts for *destination DID* and provider account binding to locate exactly one active org in the central control directory.
- Missing/ambiguous/deactivated number, cross-tenant mismatch, vendor-account discrepancy or number still in reassignment cool-down → **global security quarantine**.
- Allocate one org-scoped restricted inbox (not applicant case). No global PHI-containing dashboard for ordinary admins.

**Case gate (corroborated):** The following are mandatory **preconditions for presenting a proposed match to an authorized human reviewer**. They do **not** authorize automated release in the initial product:
1. Active expected outgoing records request for *this same organization*, and a valid, unexpired request token recovered from the fax, not solely from AI-generated similarity.
2. At least two independent contextual identity elements (for example applicant full legal name + DOB or independently validated medical record identifier) extracted or verified from the actual content, consistent with the requested patient and not in conflict with any page; be mindful that OCR confidence is not source identity certainty.
3. Provider context is consistent with the request; nothing indicates mixed patients, wrong document, incomplete pages, inconsistent identifying information, or an unintended recipient.
4. Relevant medical disclosure/authorization and purpose-of-use rules are in force; extra controls for 42 CFR Part 2 and especially sensitive notes are satisfied.
5. Backend confirms active tenant state and valid case permission path, with no client-supplied project/database/bucket selector; checks happen again before release and notification.
6. Source object is immutable/hash-checked, available after scanning/parse checks, not previously bound elsewhere and bound exactly once through an idempotent audited state transition.

**All case assignments require explicit authorized human approval in the initial GA, even if every precondition passes.** If any precondition fails, no case assignment. Route to a *restricted organizational intake reviewer*, or the central security quarantine if the organization itself is uncertain. Reviewers must have a specific time-limited intake grant; admins/billing staff do not implicitly receive PHI access. Human reviewers explicitly verify patient identity, intended receiving organization, source document, scope and destination. Four-eyes approval for proposed reassignment across organizations, cross-patient corrections, sensitive Part 2 cases or ambiguous mixed charts, with documented privacy review and legal authority. Reassignment is implemented as controlled export/import/reconciliation rather than just changing an orgId pointer.

AI/OCR may **suggest** matches and flag conflicts after approved processing only. Confidence thresholds help prioritize review but cannot substitute for mandatory deterministic checks and human release. Assume many medical faxes are degraded, mixed or unreadable; see **[ADR-004 — Degraded Fax Document Recovery](ADR-004-DEGRADED-FAX-DOCUMENT-RECOVERY.md)** for immutable originals, non-destructive page enhancement, multiple OCR proposals, visible uncertainty, source coordinates and clinically significant field validation.

## State machine and data custody

~~~text
RECEIVED
 → AUTHENTICATED
 → QUARANTINED_UNALLOCATED or QUARANTINED_ORG
 → SCANNED
 → ROUTING_CANDIDATE
 → REVIEW_REQUIRED
 → HUMAN_VERIFIED_PAGE_AND_PATIENT
 → CASE_BOUND
 → AVAILABLE_TO_AUTHORIZED_CASE_USERS
 → ARCHIVED_PER_RETENTION
exception: SUSPECTED_BREACH / FAILED_INTEGRITY / MALWARE / DUPLICATE / MISSING_PAGES
~~~

Database metadata may advance from quarantine to case-bound only after an idempotent transaction in the **same organization's named database** records request ID, applicant/case ID, document hash, original fax message ID, policy version, identity evidence, recorded human reviewer decision, page boundary verification, and timestamp. The encrypted object is promoted by a controlled storage operation that prevents public access or tenant crossover and is reconciled after failures. Cross-database operations are not ACID; use durable outbox/saga + reconciliation and fail closed on partial failures. No persistent intermediate plaintext outside approved encrypted scratch.

The central directory has no case identifier or medical record data. Use pseudonymous IDs in generalized monitoring. Keep append-only, tamper-evident protected event logs with access, release, error and incident events and a retention plan. Alert specifically on stuck quarantines, loss of callbacks, repeated vendor retries, delayed incomplete faxes, suspicious reassignment and unauthorized access attempts. Notifications to practitioners must say **"fax received; review needed"** without PHI in ordinary email/SMS push payloads.

## Human review and incident response

Provide a restricted inbox UI displaying the complete fax and original envelope only after purpose-bound access checks; show what evidence supports each proposed org/case identity, discrepancies across pages, related prior request and authorization scope. Provide actions: Verify & assign / Request clarification / Split with two-person approval / Mark wrong recipient / Escalate privacy incident / Return securely via authorized process. Preserve original unchanged and keep chain of custody of all extracted page sets.

An incorrect fax sent **to** us can itself expose a sender's PHI to an unintended recipient; simply putting it into quarantine does not conclusively make it a non-breach. Report and triage potential misdirected inbound faxes, wrong organization, mistaken disclosures and downstream access promptly under an approved incident response and breach-risk assessment, including HIPAA, Part 2, professional-confidentiality and contract duties as applicable. No automatic onward forwarding or deletion while an incident assessment/legal hold is pending.

## Acceptance criteria / red-team fixtures (mandatory for pilot gate)

1. Right DID + correct request + correct patient + matching pages → human-reviewed page-by-page authorized case release; no other org/case sees payload.
2. Wrong DID (valid number owned by a different org) with another org's patient/request data → quarantine, **never** auto-release to the DID owner or forward across orgs.
3. No DID mapping, retired/reassigned DID, duplicate DID mapping, or unknown fax account → central security quarantine, no customer access.
4. Matching cover sheet with **wrong patient content**; forged or photocopied request code; two patients in one fax → quarantine.
5. Fuzzy name match, identical names, duplicate DOB or uncertain OCR → quarantine unless all deterministic gates pass.
6. Partial pages, interrupted download, corrupted PDF, wrong vendor page count → quarantine and follow-up, no case release.
7. Duplicate/replayed callbacks, multiple same-fax retries, eventual-consistency downloads → one immutable original and at most one case assignment.
8. Race between org membership revocation and document promotion, wrong project/database injection, case grant cancellation → access denied and no PHI leakage.
9. Reassignment across cases within an org or across orgs requires recorded authority, original retained, and controlled object + metadata move with no intermediate visibility.
10. Prove an alert fires for unreviewed quarantine backlog, fax provider outage and security anomaly; an authorized responder can safely recover without bypassing policy.
11. Test Part 2 and attorney-privileged record handling in dedicated fixtures; log/audit contain no patient data in default DB.
12. Conduct independent privacy/security review, threat model and penetration tests of provider callback and routing before live use; retain QA evidence.

**Success metrics:** 0 automatic case assignments in initial GA and 0 unauthorized releases in adversarial testing; 100% of case releases satisfy logged policy evidence; 100% of uncorroborated fax receipts remain quarantined; 100% of detected delivery anomalies receive triage under an established response policy. **Do not guarantee 100% correct delivery**, because sender-origin mistakes cannot be fully controlled by software.

## Implementation / product-roadmap impact

- **WBS 8.0 (Records acquisition):** add vendor BAA and feature qualification, DID registry, request-reference cover sheets, quarantine service, webhook/API intake, per-org inbox, human assignment and page splitting.
- **WBS 3.0 (Cloud/security):** add separate central security quarantine storage, immutable audit/event chain, low-PHI telemetry, monitored secrets, least privilege, retention and per-org evidence storage.
- **G1:** approve threat model and trust boundaries, number lifecycle and database-routing rules.
- **G3:** synthetic end-to-end fax positive/negative case-routing test suite.
- **G4:** block real-data fax operation pending BAAs, authorization controls, independent security tests, incident response drills and restricted staffing coverage.
- **G5:** test operational backlogs, response times and case assignment during actual pilot with real data only if prior gates pass.

## References and security context

- HHS HIPAA Security Rule summary: https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
- HHS treatment-purpose fax safeguards: https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-permit-a-doctor-to-share-patient-information-for-treatment-over-the-phone/index.html
- HHS Part 2 2024 Final Rule (compliance by Feb. 16, 2026): https://www.hhs.gov/hipaa/for-professionals/regulatory-initiatives/fact-sheet-42-cfr-part-2-final-rule/index.html
- Documo API incoming webhooks and authenticated PDF retrieval (vendor example, not vendor selection): https://help.documo.com/hc/en-us/articles/24026506498715-Best-Practice-API-Integrations

**Status:** Architectural decision only; implementation, vendor selection and security assessment remain future milestones.
