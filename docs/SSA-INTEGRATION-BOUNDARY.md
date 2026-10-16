# SSA integrations: permission-aware local-first boundary

Status: **manual case log implemented, external SSA integrations NOT connected** (2026-10-16). The app is a synthetic-data-only preview. This document does not represent SSA authorization, affiliation, or certification.

## Why we keep the transport disabled

SSA publishes different electronic services with different authorizations and business purposes. A public government webpage does not imply an open API to submit applications, query individual benefits, access earnings, retrieve cases, or upload medical evidence.

Official reference points:
- [SSA Electronic Records Express (ERE)](https://www.ssa.gov/ere/) — evidence submission for users who meet SSA's access rules. The web portal is not an automated API.
- [SSA Appointed Representative Services (ARS)](https://www.ssa.gov/ar/) — case access and submissions contingent on an accepted appointment and account authorization. Assisting someone with forms is not equivalent to SSA-recognized representation.
- [SSA disability benefits and applications](https://www.ssa.gov/benefits/disability/) — application workflow, not an open software submission API.
- [SSA Open Data](https://www.ssa.gov/data/) — public aggregate datasets only; cannot establish case-specific claim status.
- Historical Electronic Records Express Web Services (EREWS) literature describes a SOAP/WSDL interface for certain registered providers. **The current availability, protocol, eligibility, security and partner onboarding require direct SSA confirmation.** Do not presume historical endpoints still work.

## Implemented design

`apps/desktop/src/ssa-submissions.ts` contains:

- An explicit `SubmissionAdapter` registry. Only `manual` is active. `erews` and `ars` are visibly `not_connected`. No `send()` implementation and **no network call** exists in the adapter boundary.
- A local `Packet` with synthetic case reference, purpose, intended recipient, intended/manual channel, human preparer code, exact form/document references and notes. It is a *prepared checklist*, **not** a completed SSA application.
- `preparePacket()` → `reportManualSubmission()` → `verifyExternalReceipt()`. Transitions require an explicit human attestation and, for the final phase, an independently checked external acknowledgment/date and staff reviewer code.
- Immutable append-only **in-memory** event history representing what staff *reported* to the app, not data returned by SSA. It disappears when the app closes and is not a durable regulatory audit trail.
- A guard: ERE and ARS **evidence upload portals do not count as initial application filing**.
- Validation of supplied dates and mandatory fields. No fabricated receipt IDs, filing dates, applicant/representative signatures or benefit decisions.

`apps/desktop/src/SubmissionTracker.tsx` integrates this into the default `Application preparation` screen as **Submissions & receipts**. The case reference is locked after recording packets so in-memory history cannot be silently relabeled. The synthetic Jane Doe demo clears prior entries only after confirmation.

## How to test locally

1. Start SOAR Desk with its existing Windows desktop shortcut; the launch script automatically fast-forwards main when clean.
2. Open **Application preparation** → **Submissions & receipts**.
3. Leave the case ID explicitly synthetic, e.g. `SYN-APPLICATION-001`. Select purpose `Initial SSI/SSDI claim`, recipient SSA, manual channel SSA online or field office.
4. Enter fictitious preparer code, a concise description and actual *form reference names* (e.g., `SSA-16 (09-2025), SSA-3368-BK (06-2024)`); click **Create local packet record**. It must show **Prepared only**, without a filed claim, receipt, or API call.
5. Expand record. Enter a **fictional** submission date, fictional recorder, how a submission would have occurred, and tick the explicit human confirmation; record it. State becomes **Reported submitted · unverified**.
6. Add a *fictional* SSA-issued acknowledgment string and date together with a source and reviewer code. State becomes **Externally acknowledged** (staff-entered; unverified by SOAR Desk).
7. Try an initial application using ERE or ARS portal channels: the tracker must refuse the routing, not silently treat an evidence upload as an application.
8. Switch to interviews and back; the log should remain until application close.

Automated tests:

```bash
cd apps/desktop
npm run test:submissions
npm run test:forms
npm run build
```

CI invokes these in `.github/workflows/desktop.yml`.

## Deliberately not enabled

- No credentials, API keys, OAuth, WSDL/SOAP client or bearer tokens; no EREWS handshake; no ARS scraping/browser automation.
- No PDF generation, case upload, e-signatures, secure evidence attachment or receipt retrieval.
- No real PHI/PII, production case persistence, encryption, access control, trusted timestamps, logging, document hashes or signed audit trail.
- No verification of a claim's filed/protective filing date beyond a staff-entered note and external reference. A PDF saved to disk, ERE evidence uploaded or staff pressing a button does **not** establish filing.

## Requirements before implementing an authorized connector

1. SSA confirmation of current program, partner eligibility and authorized scope for the SOAR organization or individual representative.
2. Exact current technical protocol, security, licensing, identity/access and test environment requirements.
3. Validated consent, representation, medical release, retention, permitted transmission destination and accessibility procedures.
4. Threat model and protected encrypted storage, per-user identity, roles, immutable verifiable audit, tamper-evident receipts and key management.
5. Explicit per-transmission human approval and **idempotent** retry handling, confirmation mapping and defensible error states.
6. Integration tests against a *sanctioned SSA test environment*, never live client data in development.
7. Ability to operate independently of SSA services, with manual fallback and no automatic denial / ineligibility labels.

## Public-data integration is separate

SSA public datasets are aggregate reference data. A future public-data module should fetch only a documented SSA.gov/open-data endpoint, cache data separately, record update timestamp/source and never join a public statistic with a named applicant. This is **not** implemented in the current iteration.
