# Adult Referral Screening v0.1 — Functional specification

**Status:** engineering prototype. Synthetic examples only. Not validated for real client use.

## Goal
Help a SOAR representative make a documented, individualized decision about whether intensive case-development services appear appropriate. Screening does not establish or deny federal disability eligibility. A program decision must be made by an authorized human reviewer.

## Workflow
1. Record the referral and discuss informed participation (future UI).
2. Record whether there is evidence of a medically determinable impairment, relevant functional impact, expected duration, and ability to sustain work. Evaluate combined impairments.
3. Record specific functional limitations and preserved abilities, including fluctuations and attendance/persistence.
4. Link each finding to an evidence source (applicant report, clinician records, work history or observation). Missing evidence is not proof of non-disability.
5. Validate references and rationales.
6. Produce one of three *recommendations*: advance for review, further assessment, or review service fit.
7. A named staff reviewer records a final **program-service** decision and rationale. No auto-rejection, and the applicant retains the right to pursue SSA benefits.

## Recommendation rules (prototype only)
- Any reported-only or unknown *required* domain: further assessment.
- Otherwise, if any domain is recorded as not supported: review service fit.
- Otherwise: advance for human review.

These are **not** SSA decision rules. They must be validated with practitioners before use. The current code does not score functional findings, compare earnings to SGA, evaluate age/education/vocational grids, or model statutory exceptions; reviewers must not interpret its output as benefit eligibility advice.

## Privacy and source provenance
Source identifiers must refer to case-local evidence, not public URLs or repository attachments. Never commit real names, SSNs, medical records, or copied case notes. The implementation currently uses in-memory models and **has no persistence, authentication, or encryption**.

## Acceptance criteria
- Every required finding has a rationale.
- Referenced evidence IDs exist and are unique.
- Incomplete evidence produces a request for assessment rather than a rejection.
- Non-supporting evidence requires human review rather than automated exclusion.
- Human service decisions capture reviewer identity and rationale.
- Unit tests use invented evidence identifiers only.
