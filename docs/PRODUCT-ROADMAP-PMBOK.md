# SOAR Desk Cloud — PMBOK-Aligned Product Roadmap & Integrated Delivery Plan
**Roadmap ID:** SDC-RM-001 · **Version:** 0.1 (proposed baseline) · **Prepared:** 2026-10-18  
**Sponsor / proposed product owner:** Inimetrica Operational Systems, LLC (founder)  
**Target release:** staged paid pilot in Q3 2027; production GA *conditional* on acceptance gates  
**Status:** For planning and estimation. **NOT an authorization to use live claimant data or a commitment to release on fixed dates.**

## 1. PMBOK management approach

Use a **tailored hybrid delivery model** informed by the *PMBOK® Guide, Eighth Edition* (PMI, November 2025): six principles (holistic perspective, value, quality, accountability, sustainability, empowered teams) and seven performance domains (governance, scope, schedule, finance, stakeholders, resources, risk). This is **not** a claim of PMI certification. Apply predictive controls to privacy/security, legal, contracts, architecture, funding and release gates; apply agile discovery and two-week sprints to product capabilities, UX, tests and integrations. Use rolling-wave planning: detailed plans for the next six weeks, increasingly coarse milestones beyond.

The program is one commercial product with related workstreams: (A) CareBase code and Inimetrica cloud migration, (B) core SOAR Desk Windows/client experience, (C) canonical applicant/application engine, (D) security/collaboration, (E) evidence and AI, (F) record acquisition and integrations, (G) pricing/billing/go-to-market.

**Status at baseline:** CareBase (private `crenem/CareOS-ECMR`) has Next.js/Firebase/Firestore/Genkit and an ESL-bound project configuration; its present Firestore/Storage rules contain broad access patterns and need complete tenant isolation. SOAR Desk (`crenem/SOAR-Desk`) has a restricted development beta with partial SSA forms, encrypted local vault, evidence intake and manual submission logs. A Windows NSIS *unsigned synthetic-data preview* has compiled in CI but not been accepted in end-user Windows testing. The cloud architecture and this roadmap are design proposals, not working integrations. No approved HIPAA deployment, live EHR connectivity, or SSA e-filing service exists.

## 2. Product vision and benefits case

**Vision:** Help nonprofit SOAR practitioners, disability advocates, paralegals and attorneys produce high-quality SSI/SSDI applications with one canonical applicant record, verifiable evidence, collaborative case management, and tightly supervised AI agents.

**Outcomes sought:**
1. Enter core applicant facts once; reuse them across current SSA form editions, FAST/MSR, employment, functional reports and appeals without silently overwriting historical snapshots.
2. Reduce duplicate manual entry and time spent obtaining/organizing records while improving completeness and traceability.
3. Support organizational seat management, case grants, clinician/attorney-sensitive scopes, auditability and data continuity.
4. Provide consent- and authorization-aware fax/EHR record acquisition with human approval of external disclosures.
5. Operate as a sustainable SaaS service: named-seat pricing **$49.99/month** or **$500/year**; paid cloud intelligence and collaboration, community edition retained under applicable AGPL terms.

**Out of scope for initial commercial release:** guaranteed SSA approvals, legal/medical diagnosis, unsupervised determination of disability, automatic SSA filing or purported SSA-approved electronic signatures, unrestricted EHR access, TEFCA participation without agreements, autonomous sending of protected information, multi-country patient data residency, fully offline collaborative reconciliation and unlimited premium AI. Any expansion requires recorded change control.

## 3. Product hierarchy / WBS (deliverable-oriented)

| WBS | Work package | Key outputs | Acceptance authority |
|---|---|---|---|
| 1.0 | Program initiation and business case | Charter, stakeholder register, customer discovery, initial WBS, responsibility matrix, prioritized scope and estimates | Sponsor |
| 2.0 | Intellectual property and data separation | Founder-to-Inimetrica CareBase license, asset/third-party review, former-employer credential/tenant/data scrubbing, repeatable clean build | Counsel + sponsor |
| 3.0 | Cloud platform, DevSecOps and compliance | Separate staging/prod projects, IaC, CI/CD, IAM, vendor/BAA inventory, HIPAA risk analysis, incident response, backup/restore | Security lead |
| 4.0 | Canonical claimant and application data | Applicant identity, households, financial snapshots, work/education, conditions, functioning, provenance, versioning, core SOAR stages | Product owner + SOAR SME |
| 5.0 | Multitenancy, collaboration and licensing | Org/team/seat model, ZITADEL/identity, case- and evidence-level ABAC, invites, reviews, audit, Stripe webhook billing | Security + product owner |
| 6.0 | SSA application/forms engine | Official form edition registry, field crosswalk, completeness engine, reviewed PDF exports, deadline/tracking workflow | SSA/SOAR SME + QA |
| 7.0 | AI evidence intelligence and narrative | Secure model broker (covered Google Cloud Gemini and/or approved OpenAI), OCR/ingestion, medical chronology, sourced extracted facts, FAST/MSR draft and clinician review | QA + privacy lead + SOAR SME |
| 8.0 | Records acquisition and interoperability | Provider finder, consent ledger, secure fax BAA/vendor, outbound approval, inbound triage, reminders; FHIR sandbox adapter | Privacy lead + integrator |
| 9.0 | Windows and clinician/legal practitioner UX | Native client validation, single-entry interview, micro-navigation, case queue, review/diffs, local/cloud states, accessibility | UX + QA |
| 10.0 | Pilot, commercialization and operations | Stripe catalog, pricing/AI usage budgets, support, contracts, customer onboarding, monitoring, pen test, training, incident runbooks | Sponsor + security lead |
| 11.0 | Post-launch expansion | Partner-specific FHIR integrations, appeals/hearing tools, advanced reporting and optional deeper AI agent workflows | Product owner |

## 4. Release boundaries and dependency logic

**Release A — Synthetic technical alpha:** stages 0–3 with canonical record, safe mock tenant and form engine. **No real claimant data.**  
**Release B — Private PHI-ready pilot candidate:** controlled shared cases, acceptable contract/security gates, forms, sourced AI, secure document import and optional fax. Gate approval precedes *any* real-data invitation.  
**Release C — Commercial GA:** stable paid seats, production support, verifiable data export/continuity, tested backups, security validation, incident response and pilot evidence.  
**Release D — Integrations expansion:** FHIR and external EHR/exchange partners after permitted-purpose, contract, SMART authorization and partner readiness.

The critical dependency chain is **IP/data separation → Inimetrica clean staging → tenant security + canonical data → validated form mapping and evidence → security/BAA gate → human-reviewed pilot → commercial GA**. AI prototypes, Stripe sandbox and synthetic fax/FHIR integrations can proceed in parallel, but PHI cannot flow through them before the gates.

## 5. Provisional integrated milestone schedule (assumes funded cross-functional team)

| Phase / gate | Target window | Deliverables | Objective gate / exit evidence |
|---|---|---|---|
| **0. Initiation — G0 Charter** | Oct–Nov 2026 (weeks 1–4) | Charter; CareBase/SOAR repo inventory; written IP-license plan; 6–10 customer discovery interviews across SOAR and legal practices; preliminary BAA matrix; product backlog, definition of done, cost/capacity range | Sponsor approves scope, target users, benefit case, owners, initial risks, no transfer of ESL data |
| **1. Architecture & clean staging — G1 Secure design** | Nov–Dec 2026 (weeks 5–10) | Cloud IaC; empty Inimetrica staging; removal of legacy project fallback; baseline threat model; privacy data map; tests for Firestore/Storage isolation; Windows native smoke test | All critical former-tenant references removed from deploy path; no unauthenticated/wrong-tenant access; restore drill with synthetic data |
| **2. Canonical applicant & team workspace — G2 Core platform** | Jan–Mar 2027 (weeks 11–22) | Applicant model, effective dates/provenance, versioned facts, organization/seat/member/case grants, case queues, write conflict policy, APIs; first 3–4 SSA crosswalks | Representative synthetic journeys pass; **zero** cross-tenant fixture leaks; revoked user denied; applicant facts reused without silent overwrite |
| **3. Forms, evidence and AI prototype — G3 Feature-complete alpha** | Mar–May 2027 (weeks 19–31; overlaps stage 2) | Verified SSA templates and versions; more form mappings; local encrypted record bridge; chronology, cited extraction and FAST/MSR proposals with human edit/reject; AI budget controls | High-risk field mapping tests pass against reviewed official editions; no unsupported auto-citations accepted; no unreviewed outbound actions |
| **4. Managed acquisition, billing and HIPAA gate — G4 Pilot authorization** | May–Jul 2027 (weeks 27–39; overlaps stage 3) | Secure fax vendor + BAA where applicable; authorization model, provider request workflow, inbound quarantine; Stripe live-seat mechanics, contract/BAAs, security risk analysis and mitigations, pen test, support plan | Signed agreements, written go/no-go for PHI, medium/high findings accepted or remediated under policy, access/export/recovery tests passed. Otherwise remain synthetic-only |
| **5. Controlled customer pilot — G5 Product validation** | Jul–Sep 2027 (weeks 38–47) | 2–4 pilot organizations, cross-sector practitioner onboarding, monitored case workload (real only after G4), incident/tabletop exercises, source-grounding & usability audits, retention and cancellation drill | Pilot sign-off by users and security lead, documented performance/cost metrics, no unresolved critical/high vulnerabilities, verified customer offboarding/data continuity |
| **6. Commercial launch — G6 GA** | Sep–Oct 2027 (weeks 46–53) | Public licensing, signed Windows installer or supported web app, operational SLO, support/invoicing, pricing/AI usage policy, runbooks, post-implementation review plan | Go/no-go board accepts launch checklist, security and operational readiness, support capacity, incident escalation, real billing reconciliation |
| **7. EHR interoperability expansion — G7 Partner-specific** | Q4 2027 onward | FHIR R4/SMART sandbox, authorized EHR pilot, Cloud Healthcare API when useful, formal vendor/network agreements | Legal basis + supported scopes + partner authorization + negative access tests + provenance preserved |

**Schedule disclaimer:** Dates are planning ranges, not a validated critical-path schedule. If engineering capacity is less than approximately 3 dedicated engineers plus a participating founder/product lead, QA and privacy/security professionals, shift phases and gate dates after phase 0 estimation. A failed gate pauses affected work or limits it to synthetic data; calendar dates never override security gates.

## 6. Near-term implementation backlog / first six sprints

| Sprint | Focus | Accepted story slices |
|---|---|---|
| S0 (Oct 19–Nov 1) | Baseline and decisions | Confirm end-user journey; identify repo ownership/license items; audit former-tenant config, secrets and rules; list SSA forms; create synthetic personas and test fixture library |
| S1 (Nov 2–15) | Cloud deployment isolation | Remove legacy project defaults, separate stage/prod config, new empty staging project, reproducible build and IAM setup; no production data |
| S2 (Nov 16–29) | Security harness | Deny-by-default authorization policy and Firestore emulator tests across org/case/evidence; structured audit event; backup prototype |
| S3 (Nov 30–Dec 13) | Canonical applicant model | Create effective-dated applicant facts, sources, verification state and mutation/review rules; map identity/work/provider sample fields |
| S4 (Dec 14–27) | Practitioner workflow | Build referral, interview, source links and missing-field navigation with synthetic applicant; first form crosswalk and validated draft |
| S5 (Dec 28–Jan 10) | Collaboration increment | Organization provisioning, invites, named-seat skeleton, approved case assignment and role-revocation tests; demonstration and re-estimate |

Sprint names and dates are suggested cadence; ordering may change after charter approval and dependency analysis.

## 7. Governance, decision rights and stakeholder management

**Project board:** sponsor/founder (business decisions, funding, scope); product owner (backlog/value); technical lead (architecture/quality); privacy/security officer or independent reviewer (veto on PHI gate); SOAR subject-matter reviewer (application/form correctness). Legal/accounting and 2–4 design partners advise on contracting, SSA rules, law-office confidentiality and adoption.

**RACI (roles can be staffed externally until hiring):**

| Decision / deliverable | Sponsor | Product owner | Technical lead | Privacy/security lead | SOAR/Legal SME |
|---|---|---|---|---|---|
| Charter, funding and change budget | **A** | R | C | C | C |
| Workflow and backlog prioritization | C | **A/R** | C | C | C |
| Architecture and deployment | I | C | **A/R** | C | C |
| PHI release/contract authorization | A | C | R | **R (independent sign-off required)** | C |
| SSA form edition and narrative rules | I | A | R | C | **R** |
| Pilot and general availability go/no-go | **A** | R | R | R | R |

A = accountable, R = responsible, C = consulted, I = informed. Dual required sign-off on PHI must be documented even if sponsor carries ultimate business accountability.

**Cadence:** sprint planning/review every two weeks; weekly delivery and dependency dashboard; fortnightly risk/issue review; monthly steering committee and financial forecast; formal gate decisions at milestones and after critical incidents. Requirements traceability ties `user need → feature → test → acceptance evidence → gate`.

**Change control:** backlog refinement is routine within a phase; scope changes affecting PHI/data sharing, contracts, model providers, authentication, legal filing claims, budget envelope, or milestone baselines require a short written change request (benefit, options, schedule/cost/risk/security impacts, approval/rejection and revised baseline). Record decision history in the repo without confidential applicant details.

## 8. Quality management and definition of done

All work packages require: approved requirement and threat consideration; code review; dependency/license check; unit+integration+negative authorization tests; source and data provenance; accessibility acceptance; audit impact; monitoring; rollback; updated user/admin documentation.

**Non-negotiable release gates:**
- Zero unresolved **critical** security issues; high findings formally remediated before PHI processing unless independently documented as controlled and acceptable under policy. Separate external penetration test for production.
- Zero successful cross-tenant data reads/writes in attack-oriented tests for list/search/evidence/AI paths. No privilege gain by editing user claims or guessing object IDs.
- 100% of accepted AI medical assertions trace to reviewable evidence location or explicitly labeled applicant/practitioner statement; citations cannot be invented. AI output defaults to proposal status.
- No unapproved AI-initiated fax, EHR disclosure, SSA submission, signature or change to verified claims.
- Tested BAA/scope matrix for every PHI processor, patient record authorization rules (including 42 CFR Part 2 where applicable), least privilege, audit retention, and encrypted backups/restores.
- Repeatable PDF mapping and validation against the *correct official form version*; drafts cannot assert SSA acceptance. A passing form completeness check is not a legal eligibility judgment.
- Accessibility target WCAG 2.2 AA where applicable, tested with keyboard/screen-reader and assistive technologies; workarounds documented.
- Offboarding and payment failure do not lock practitioners out of lawful retrieval/export of existing records.
- E2E onboarding, seat purchase, cancellation/proration, organization switching and anonymized operational monitoring tests.

## 9. Financial baseline and success metrics

**Price architecture:** Stripe customer = organization; subscription item quantity = named paid seats. `$49.99` billed monthly, `$500` billed annually. Discount for annual price versus 12 monthly payments is approximately 16.65%. No client identifiers or medical narratives in Stripe metadata. Implement signed/idempotent webhook handler; verify server-side entitlement. Model variable AI + OCR + fax + EHR vendor transaction costs separately from staff and infrastructure.

**Financial controls:** Stage 0 must produce a bottom-up staffing and vendor cost estimate with three scenarios (lean, planned, accelerated), phase-bounded investment ceilings, an initial cash runway, and a unit-cost model per organization/active seat/processed case. Apply contingency to uncertain EHR/vendor costs; do not assume AI inference is unlimited at this price. Forecast on contracted seats, churn, invoice collection and real usage—not hypothetical 3,000-seat target as committed sales.

**Proposed value KPI targets (pilot validation, subject to baseline):**
- ≥30% reduction in median practitioner time on repeat-entry/form assembly versus observed pilot baseline; inspect full task time, not merely generated forms.
- ≥90% relevant canonical data reuse where mappings support it; zero silent overwrites of historical snapshots.
- 100% accepted AI evidence findings sourced and reviewed; zero critical hallucinated citations in signed-off reports.
- 100% of official outgoing fax requests tied to valid authorization, recipient verification, human approval, and logged transmission outcome.
- 100% tested cross-tenant access rejection; restoration drill passes; report RTO/RPO measured values against contracted SLO.
- Track time-to-records, submitted package defects, evidence gaps, denied missing authorizations, AI cost per case, practitioner satisfaction, conversion, churn, gross margin and support tickets. **Do not promise an SSA approval rate** or use denial outcomes as a standalone software-performance measure.

## 10. Living RAID register (baseline)

| ID | Risk / assumption / issue / dependency | Impact | Preliminary treatment | Owner |
|---|---|---|---|---|
| R1 | Legacy CareBase repo has insecure broad rules and hardcoded former Firebase environment | Critical | Clean-room project, fail-closed config, emulator tenant attack tests, independent review | Security/tech |
| R2 | Founder IP licensing vs previous employer and third-party rights | High | Written owner-to-LLC license, dependency/asset audit; prohibit transfer of ESL data | Sponsor/counsel |
| R3 | Vendor BAA and feature eligibility mismatch for Gemini/OpenAI, fax and hosting | Critical | PHI processing disabled until executed agreements and endpoint/feature review | Privacy lead |
| R4 | Agent hallucinates citation or sends unapproved PHI | Critical | Evidence-scoped prompts, source checks, mandatory human action gate, deny-by-default tools | AI/security |
| R5 | SSA form changes invalidate outputs or fields | High | Edition registry, checksums, regression fixtures, release review of SSA changes | SSA SME |
| R6 | EHR/TEFCA participation delayed, wrong exchange-purpose assumptions | High | Fax-first fallback; FHIR mocked adapter; partner agreements and SMART scope evidence | Integrations |
| R7 | AI/fax/cloud costs exceed $500 annual seat economics | High | Quota, budgets, model routing, explicit overages and per-organization visibility | Finance/tech |
| R8 | Founder's time / engineering hiring lags estimate | High | Rolling-wave replanning, tighten MVP to one-entry forms + evidence + case collaboration | Sponsor/PM |
| R9 | Local vault vs cloud synchronization conflicts, recovery/key loss | Critical | Explicit conflict policy, synthetic chaos/backups, no automatic migration until accepted | Tech/security |
| R10 | Subscription failure or user turnover blocks client continuity | High | Export rights, retention policy, delayed entitlements for non-critical features, reassignable seats | Product/security |
| A1 | Nonprofits and disability firms will value a common workflow | Unvalidated | Interview both cohorts, paid design partners, usage data and willingness-to-pay tests | Product owner |
| D1 | Inimetrica staging Google Cloud project and IAM not yet confirmed | Blocking | Record project ID, billing ownership and secure deployment account before infrastructure writes | Sponsor |

Score probabilities and residual exposure at G0. Review weekly. Escalate a critical security issue immediately, not at the next monthly meeting. Treat requirements and target dates as **hypotheses until baselined**.

## 11. Stage-gate decision record template

At the close of each phase record: `Gate / date / evidence reviewed / scope completed / defects / unresolved risks / budget spent vs forecast / staffing / customer feedback / release boundary / decision (GO, CONDITIONAL, HOLD, STOP) / authorized signer / conditions and due dates`. Do not automatically open PHI or customer deployment because CI passes. Production Go requires an explicit written decision.

## 12. First decisions requested

1. Confirm product owner, project manager/engineering/security roles and planned staffing capacity.
2. Confirm Inimetrica Google Cloud staging/prod project ownership and deployment approach.
3. Approve the personal IP-to-Inimetrica **license** (not assignment) plan, including restrictions on legacy assets and data.
4. Authorize a **synthetic-only** discovery and architecture sprint; reserve real records for the HIPAA/security gate.
5. Decide the **first paid user cohort** (SOAR nonprofits, disability firms, or mixed) and recruit 6–10 interviews / 2–4 design partners.
6. Review staged **MVP scope**: enter once → forms/evidence → tenant collaboration → safe billing and case continuity. Fax and AI launch only when ready; partner EHR integration remains post-GA.

## Authoritative reference points

- PMI, *PMBOK Guide, Eighth Edition* (Nov. 2025): https://www.pmi.org/standards/pmbok
- PMI, phase-gate governance: https://www.pmi.org/learning/library/phase-gate-processes-promising-complex-547
- PRA, Standard SOAR Process (Sep. 2025): https://www.prainc.com/soar-process-ssdi-ssi-applications-guide/
- PRA, SOAR Critical Components (Sep. 2025): https://www.prainc.com/soar-critical-components/
- HHS, HIPAA and Cloud Computing: https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html
- HHS, HIPAA Security Risk Analysis: https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html
- Google Cloud HIPAA covered services: https://cloud.google.com/security/compliance/hipaa-compliance
- ONC, developer EHR access and standards: https://healthit.gov/patient-access-to-health-records/developers/
- Stripe per-seat pricing: https://docs.stripe.com/billing/subscriptions/metered-billing/thresholds

**Document owner:** Inimetrica Product Office · **Next revision:** after G0 sponsor approval and discovery estimates.
