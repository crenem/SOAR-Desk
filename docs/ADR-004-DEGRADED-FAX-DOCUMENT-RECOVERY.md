# ADR-004 — Degraded Fax Document Recovery, Page-level Verification and Source Integrity

**Decision:** Adopt as required product design (2026-10-19). **State:** Not implemented; PHI processing prohibited until security/contractual authorization.  
**Companion:** [ADR-003 — Inbound fax containment and routing](ADR-003-SECURE-INBOUND-FAX-ROUTING.md); [ADR-002 — Organization database isolation](ADR-002-ORG-DATABASE-ISOLATION.md).

## Why this matters

Medical records received by fax are routinely hard for humans to decipher: faint photocopies, clipped margins, low resolution, overlapped stamps, handwriting, black streaks, duplicated and missing pages, upside-down images and bundled charts from multiple patients. A language model may produce plausible **but false** text from unreadable pixels. A medication dosage, date, negation or patient name misread can contaminate applicant evidence and may lead to a wrong-case confidentiality breach.

**Product invariant: Original fax is authoritative. Never silently replace it with AI-enhanced or interpreted text; an illegible character remains unknown unless verified from a legible source.**

## Decision

Use **immutable source retention → image-quality detection → non-destructive image enhancement → OCR with alternate hypotheses → evidence- and geometry-linked AI proposals → page/document segmentation → human verification and controlled release**. In the initial live release, **every fax packet requires an authorized human to verify the intended organization, patient, authorization and page boundaries before case assignment**, even if deterministic routing checks suggest a match. AI alone never promotes text to verified case facts or grants routing permission.

### Processing pipeline

~~~text
Authenticated fax service → org-contained encrypted quarantine
   ↓
Preserve exact original PDF/TIFF, hash (SHA-256), pages and vendor receipt
   ↓
Page-level inspection: blur / faint text / noise / missing crop / skew /
                     handwriting / fax streaks / black or blank regions
   ↓
Derivatives only: rotation, deskew, contrast enhancement, binarization,
                  gentle denoise, region crops [original never modified]
   ↓
OCR passes: native text extraction (if any), primary document OCR,
             selective second pass on problematic regions
   ↓
Compare hypotheses, keep bounding boxes, provenance, uncertainties
   ↓
AI-assisted DOCUMENT/PAGE identity checks and medical data proposals
   ↓
Restricted human workbench: verify all patient/document segments
   ├── APPROVE case attachment for verified pages only
   ├── REQUEST higher-quality native PDF/EHR copy/retransmission
   ├── SPLIT / CORRECT with documented review (mixed pages)
   └── ESCALATE possible wrong-recipient/Part 2/privacy incident
   ↓
Source-cited accepted evidence → SSA forms/FAST (separate clinical review)
~~~

### Page-quality detection

Google Cloud Document AI Enterprise OCR currently provides optional page-level image-quality scoring, with defects including blurry, noisy, faint, dark, document cutoff, text cutoff, small print and glare; it also offers rotation correction and printed/handwritten OCR. These are indicators, **not guarantees** that a name, DOB, dosage or clinical fact is correct. Flag issues at page and region level, not just one quality number for the entire transmission.

### OCR / AI accuracy rules

- Store word, line and extraction region coordinates, page ID, source hash, confidence and OCR model/version. Keep competing hypotheses when different pipelines disagree; agreement among models can still be a shared error.
- Never infer unreadable medical words merely because they are statistically plausible. Mark unknown characters and clinical claims as **unreadable**, **uncertain**, **conflicting** or **human-verified**.
- Never rely on generative “super resolution” pixels as primary evidence. A synthetic improvement could invent character strokes. Label reconstructions as assistive and retain every unmodified original image.
- **High-risk fields:** patient name, DOB, medical record number, SSN, drug name/dose/unit, dates, negation, lab values, diagnoses, consent and signatures require manual review of the source image, not only a proposed text layer. When source is genuinely unreadable, request another copy; no amount of AI certainty makes a missing character reliable.
- Extraction is separate from patient routing: one verified intake reviewer may attach approved pages to a case; another case-authorized practitioner reviews individual medical facts for use in SSA filings/FAST reports.
- If a fax contains more than one patient, partition candidates only inside quarantine, never automatically assign pages. Identity must be checked across pages/document sections. Matching a cover page does not validate subsequent content.
- Document authors and practitioners must see original pixels and highlighted source rectangles adjacent to AI summaries. Provenance chain must follow source fax → page region → OCR hypotheses → accepted/corrected fact → narrative/form field.

### Review workbench

A **dual-pane page review UI** displays immutable original fax with pan/zoom/rotate, optionally toggled enhancement layers, suspect page edges, identity headers and potential mixed-patient conflicts. Parallel panel displays OCR result with uncertain words highlighted, confidence signals, original clipping overlay, a field-edit control, reviewer identity and decision reason.

Controls: **accept/verify**, **correct from legible source**, **unreadable—request retransmission**, **split for authorized page review**, **wrong recipient—privacy review**. Medical findings cannot be silently auto-accepted when an intake staff member approves identity.

### External records reacquisition

For poor or missing pages, automatically **draft** a records re-request, ideally for native digital PDF through a provider portal, secure Direct/FHIR channel where authorized, or higher resolution scan rather than another fax. Any outbound PHI requires valid disclosure basis, verified destination and authorized human action. Track versions and invalidate downstream evidence or draft forms if corrected medical text changes.

### Safeguards and tests

- All processing is isolated to the proper organization's encrypted intake, using only contractually approved PHI processors, BAA-covered capabilities and least-privileged services. Unknown DID → separate restricted security queue; do not place PHI in Firestore (default), logs, billing or AI telemetry.
- Test a **synthetic degraded-fax corpus**: low DPI, dark/faint, rotated, cropped headers, hand edits, photocopied charts, same-name patients, 10 vs 100 mg, 0 vs O, changed DOB, “denies” vs “endorses”, mixed patients, missing/reordered/duplicated pages and corrupted PDF.
- **Required:** 100% incoming originals hash-verified; 100% patient case releases documented with authorized **human** packet/page review for initial GA; zero intentionally mixed-patient packets auto-released; zero successful cross-tenant access in adversarial tests; zero AI-created source citations treated as verified; all unreadable high-impact values visibly held for review/re-request.
- Track real-world OCR character/word error rates by quality stratum, false-negative mixed-patient detection, false-positive match proposals, reviewer correction time, requests for new records, and privacy incidents. Use test metrics to optimize labor and quality, **not to assume error-free OCR**.
- G4 security/BAA and G5 operational pilot gates remain mandatory before PHI.

## References

- Google Cloud Document AI Enterprise OCR and image quality: https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr
- Azure Document Intelligence Read OCR (comparison): https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept-read
- HHS HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html
- HHS HIPAA Security Risk Analysis: https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html

**Product stance:** Poor-quality faxes are the expected input. Safe uncertainty and source preservation, not automatic transcription, are the core product features.
