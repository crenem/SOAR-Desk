# ADR-003 — Secure Inbound Fax Intake, Patient Matching, and Degraded-Document Recovery

**Decision date:** 2026-10-19  
**Status:** Architecture accepted for product planning; **not implemented, tested, or approved for PHI**.  
**Scope:** SOAR Desk Cloud inbound medical faxes and other scanned evidence for nonprofit SOAR organizations and disability law firms.  
**Priority:** Critical security and clinical data-integrity control.  
**Related:** [ADR-002 — Tenant Database Isolation](ADR-002-ORG-DATABASE-ISOLATION.md), [PMBOK Product Roadmap](PRODUCT-ROADMAP-PMBOK.md).

## 1. Decision / nonnegotiable invariant

**Fax delivery is not proof of patient identity. OCR/AI is never sufficient authority to route a packet to an applicant.** A fax must not be released to an applicant's case until an authorized human reviewer has verified organization, patient, document/page boundaries, and legal authorization in the first production version. If any material uncertainty remains, keep the relevant material in a restricted encrypted quarantine or seek a better source; do not guess. Use retrieval metadata for initial organization containment, not as identity proof.

We cannot promise zero errors or perfect OCR, and can only manage them with defense in depth, human review, incident containment, tested controls and error measurement. AI *may propose* candidate matches and extracted facts but cannot approve external PHI disclosure, case-routing release, signatures, or medically consequential data without independent verification.

Design to handle faint faxes, skew, truncated margins, noise/streaks, handwritten changes, mixed patient pages, inverted scans, multi-part transmissions, resends/duplicates, wrong destination numbers and malformed or malicious attachments.

## 2. Security zones and data path

~~~text
Fax gateway (BAA + verified integration)
  ↓ authenticated webhook, unique provider message ID, known destination DID
Inbound receipt zone
  ↓ retrieve safely; signature checks, malware/content/size limits, SHA-256
  ↓ original fax stored IMMUTABLY; metadata separated from content
Organization-restricted quarantine (based solely on trusted provisioned DID)
  ↓ image quality + per-page enhancement derivatives; OCR and AI proposals
  ↓ separate patient/page/authorization validation
  ↙ matched provisionally                    ↘ unknown, mixed or wrong patient
   restricted human reviewer                hold + privacy workflow, no case link
   ↓ confirm exact organization, patient, each page boundary, authorization
   ↓ approval audit + transactionally bound release
Named organization Firestore DB (case metadata) + restricted evidence storage
   ↓ evidence registration and source-cited medical analysis
SOAR forms/FAST/medical chronology — subsequent practitioner approval
~~~

**Organization DID ownership:** map an inbound dedicated fax number (DID) to one organization with an immutable, time-versioned allocation (explicit activation/deactivation; cooling-off quarantine before number reuse). A vendor webhook-reported destination number is useful if authenticated and reconcilable with provider message ID. Treat source/caller fax number as non-authenticating and avoid auto-trust. If destination DID is unknown, reassigned, inconsistent or provider authenticity fails, route to a segregated security holding zone, not to any organization's UI.

**Do not automatically reroute between tenants**, even if content seems to identify another organization. Wrong-tenant messages receive restricted incident/privacy review; approved disposition may include secure return/retransmission through authenticated channels. Avoid granting support staff universal PHI access.

**Quarantine scope:** organization-isolated quarantines are preferred after DID lookup. When organization is unknown, use a separate tightly controlled intake-security area with very limited access, short reasoned retention, and audited access. Its existence is an exception and is not the shared control-plane Firestore `(default)`; the control plane must contain no PHI.

## 3. Fax reception, duplicate/idempotency and provenance

- Validate provider webhook signature/authentication and idempotent event processing. Poll provider reconciliation for lost webhooks. Verify metadata by signed provider API response rather than trusting inbound request parameters; alert on unexpected DID or discrepancies.
- Immediately record provider ID, receiving DID, timestamp, page count, transport status, original binary SHA-256, byte count, source format and encryption object version. Preserve the original *unmodified* under write-once/retention-lock policy as legally appropriate; maintain hashes for every derivative.
- Run file-type/malware validation, PDF parser sandboxing, resource limits and decompression limits before further processing. Prevent IDOR and path injection. Decrypt only within appropriately authorized processing services.
- Retransmissions may contain missing/better pages: deduplicate only when same provider message and identical content hash. Near-duplicate content and fax resends must be related as versions, **never silently discarded**.
- “Transmission success” means transport accepted/delivered; not proof that intended patient, legal recipient or full medical record is correct.

## 4. Content-independent routing prior to medical OCR

A case-level routing hypothesis can use, in order of reliability:
1. Verified inbound DID-to-organization mapping: binds **only** the organization quarantine.
2. High-entropy request token printed as barcode/QR plus human-readable key on a fax-return cover sheet; validate against outstanding authorized request record in that SAME organization. A header or token can be missing, mutilated, reused or copied; do not treat token as sole patient proof.
3. Cross-check applicant identifiers on **each document/page group**, verified against that organization’s record, including name plus DOB and/or additional agreed identifier, with sensitivity to aliases, typos and fax distortions. Do not infer SSN/DOB from model guesses.
4. Request/sender context, provider identity and page sequence; weak corroborating evidence, never sufficient alone.

Patient matching rules: detect multiple unique names, DOBs, MRNs, inconsistent page headers/footers or discontinuous document sequences, including mixed-patient bundles. Split candidate groups **only into quarantine** until verified by a reviewer. Empty, cropped, handwritten, redacted or ambiguous identifiers are unresolved, not negative evidence. Wrong-patient evidence should never be automatically reassigned, even intra-organization.

### Release policy (initial GA)

- **No auto-file into a patient case.** A named, case-authorized reviewer confirms organization, applicant, *all relevant page spans*, and appropriate consent/records-request basis before promoting content from quarantine.
- Dual review for detected **cross-patient conflicts**, low readability affecting identity or unauthorized misdirection when a legitimate corrected match can be established. Otherwise obtain retransmission or keep unresolved in quarantine.
- Audit reviewer ID, exact source hash/page boundaries, match factors, open uncertainties, timestamps and case grant. Approval is version-specific and invalidated if source/pages change.
- System must support **reject**, **request legible retransmission**, **send to privacy officer**, **split for review** and **accept into case** decisions.

## 5. Degraded-document recovery pipeline (original always authoritative)

**A. Page quality triage:** For each page estimate DPI, rotation, black/blank regions, margins, noise, blur, faint text, text cutoff, handwriting, duplication, likely missing pages, and unreadable regions. Google Document AI Enterprise OCR supports deskew, printed/handwritten text and optional page image-quality/defect scores. These model scores are *not calibrated patient safety assurances*. Mark quality separately from OCR accuracy.

**B. Non-destructive image versions:** render original page plus separate derivatives: orientation/deskew, contrast/illumination correction, adaptive binarization, gentle denoising, de-speckling and region-focused crops. Maintain SHA-256 hash, processing version, page and coordinate transform for every derivative. Processing must never alter original or erase handwriting annotations. Do not invent visual pixels using generative upscaling; if used for readability assistance, label reconstructed pixels as artificial and never treat as original evidence.

**C. Multiple OCR hypotheses:** Primary OCR via an approved covered Document AI/other OCR endpoint; local OCR fallback and targeted second-pass at alternate preprocessing for low-quality regions. Store token/line bounding boxes, source page, output candidate, model/version, confidence, processing variant and extraction trace. Agreement between two OCR systems is **not** independent verification; correlated misreads are possible.

**D. Vision-language interpretation:** A BAA-covered and explicitly approved model may make *proposals* of typed clinical facts and candidate words using the original image and OCR tokens; prohibit “filling in” illegible words by context. Mark as **unreadable**, **uncertain** or **conflicting** when uncertain. Every medical claim must cite source page and bounding region, plus extraction technique and human verifier status.

**E. High-risk clinical fields:** Dosages, units, dates, identity numbers, diagnoses, allergies, test results, procedure codes and negations (e.g. “denies” vs “endorses”) require independent human confirmation of the exact image and underlying meaning before verified case facts, narratives or exported forms. Suspicious differences such as 10 mg vs 100 mg, 0/O, 1/I, minus signs, decimals, and dates should be highlighted, never decided silently.

**F. Failure and reacquisition:** If unreadable after quality improvement, flag pages as not interpretable, create record reacquisition tasks, and if authorized send a verified outbound fax or other secure request seeking a digital PDF, direct provider portal export or FHIR/CCD/EHR copy. Do not fabricate a clinical summary when evidence is incomplete.

## 6. Reviewer UX and quality controls

Design a **page-by-page dual-pane verification workbench**: original image (zoom/rotate/invert, optional image enhancements), proposed text, source region overlays, visible mismatch highlights, patient-name/DOB header checks, page-segmentation marks, request token, and queue status.

- Always display original alongside proposal; keep meaningfully uncertain snippets marked as such.
- Separate **identity/page routing approval** from **medical extraction/clinical finding verification**. Assignment by intake personnel does not make OCR clinically verified.
- Allow field-level correction with original transcription and source link retained; require rationale for identity overrides.
- Include a restricted privacy-incident workflow (contain, investigate, assess breach, notify under applicable rules/organizational policy). Never send PHI to email alerts, logs, Stripe metadata or general analytics.
- Accessibility: keyboard-accessible image viewer and text alternative workflow; ensure reviewers can request accessible native digital records if fax illegible.
- Track data lineage through raw fax → derived page → OCR hypotheses → human correction → accepted evidence fact → SSA form/MSR. Subsequent retransmission creates new version; any prior outputs depending on changed content must be flagged for review.

## 7. Agent access and isolation rules

- AI classification and OCR processing happen only **inside the established quarantine organization's authorized processing boundary**, using approved processors and documented BAAs; no PHI-bearing OCR in a shared global service without an approved tenant-bound policy and access controls.
- Agents cannot choose arbitrary database/project IDs or fax recipients, move materials between organizations, grant users access, mark route/clinical facts as verified, release documents or override quarantine.
- The backend uses organization DID mapping for quarantine, then `(default)/Organizations/{orgId}` solely as a PHI-free directory to resolve trusted project and database IDs; case grant verification occurs in the tenant's named database.
- Service IAM must minimize blast radius of one organization's processing. Avoid central AI/vector indexes containing identifiable text from multiple tenants without purpose-specific approved separation.
- No customer access to another organization's security queue; audit all exceptional administrative access.

## 8. Test and release acceptance criteria (G4/G5)

Must test **synthetic but realistically degraded** fax corpus, including multiple pages, degraded resolution, skew, noise, stamps, handwriting, cropped DOB, faxed photocopies, partial retransmissions, duplicate webhooks, fax number reassignment, malformed PDFs, wrong-number faxing, two different patients in one packet, transposed DOBs and multiple cases with identical names.

Minimum hard safety criteria:
- **Zero case releases without recorded page-level authorized human routing approval** in first GA.
- **Zero successful cross-organization disclosures or auto-routes** under adversarial tests. Zero successful case access for nonmembers and revoked case grants.
- **100% of quarantined arrivals have an independently verifiable original hash**, organization route provenance or security queue designation, bounded processing, and reconciliation.
- **No accepted clinical fact without source page/region and reviewer verification**, including negations, dosages, diagnoses and identifiers.
- **100% of simulated multi-patient packets with known contradictions are held for review**; release-blocking detection is tested. Detection cannot guarantee all mixed pages, so human case release remains mandatory.
- End-to-end reconciliation of vendor fax counts, received originals, quarantine decisions, released case attachments and incident reports, including webhooks lost or retried.
- Demonstrate a successful quarantine-only handling path for all unreadable or incorrectly addressed test packets; test both backup/restore and audit export.
- Measure false negative patient mix detection, OCR word/character error rates by document type and quality, correction time, retransmission rates, routing error rates and percentage of packets needing manual action. **Do not interpret any model confidence threshold as permission to auto-file.**

No production PHI workflows until fax vendor BAA/feature review, Google/OpenAI OCR/model BAA suitability, tenant IAM/privacy review, penetration testing and written G4 authorization.

## 9. Project controls and rollout

**Phase 1:** Build synthetic-only vendor connector, authenticated webhook, DID registry, immutable original store, encrypted quarantine, mandatory manual assignment and privacy escalation. This phase requires *no OCR to route*.

**Phase 2:** Add per-page image-quality triage and non-destructive enhanced images; source-aware OCR proposals, reviewer dual-pane UI and retransmission workflows.

**Phase 3:** Add tenant-scoped medical extraction, clinical source spans and FAST/SSA evidence propagation only after human verification, with strict downstream invalidation.

**Later, separate risk assessment:** Evaluate case-level automation of *non-clinical indexing* under measured error rates; do **not** silently relax cross-tenant or patient assignment protections.

**Dependencies:** ADR-002 named organization databases; signed fax vendor agreement and BAA where applicable; provider API security review; case permission/consent ledger; tenant storage/KMS and independent audit architecture.

## 10. References

- Google Cloud Document AI Enterprise Document OCR: https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr
- Microsoft Document Intelligence OCR and confidence (comparison/reference): https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept-read
- HHS HIPAA Security Risk Analysis: https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html
- HHS HIPAA Breach Notification Rule: https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html

**Design premise:** Poor and mixed fax quality is the default, not an exception. Safe uncertainty handling is a product feature.
