# SOAR Desk — workbench release status

Updated October 16, 2026. **Restricted development beta; not approved for live nonprofit PHI workflows or SSA electronic filing.** This status is a developer acceptance checklist, not a security certification.

## Implemented and currently testable

| Area | Current capability | Limitation |
| --- | --- | --- |
| Desktop shell | Native-function Windows-style controls and protected close flow | No signed Windows distribution or completed accessibility review |
| Navigation | Form > section > missing field micro-navigation | Progress counts only presently modeled interview fields; it is not SSA completeness |
| Interviews | Partial guided SSA-16, SSA-8000-BK, SSA-3368-BK, SSA-827, SSA-3369-BK and SSA-3373-BK | Incomplete field inventories, branches and form-accurate PDF mappings |
| Case state | Restricted encrypted local CASE-UUID snapshots, autosave and nonprofit recovery credential | Organizational authentication, roles, tested upgrades, and independently anchored audit are absent |
| Evidence | OCR/local model suggestions, source hash checking, encrypted original attachments and evidence register | Model findings and encrypted attachment metadata do not equal human verification; review provenance needs end-to-end confirmation |
| Acknowledgments | Drawn/typed, SHA-256-bound internal signer intent records | Not an SSA-approved signature or SSA-827 authorization |
| Exports | Verified-edition SSA-16 unsigned incomplete PDF draft and explicit plaintext evidence export | Not a completed SSA filing; plaintext exports require authorized protected handling |
| Submissions | Manual status and receipt log | No SSA submission service or independent receipt verification |

Windows x86-64 / CUDA synthetic release exercise: [release acceptance](RELEASE-ACCEPTANCE-WINDOWS-CUDA.md). Current integration smoke tests and operational cautions: [Usability and release checklist](USABILITY-AND-RELEASE-CHECKLIST.md). Architecture: [Production vault decision](PRODUCTION-VAULT-ADR.md). Official form constraints: [SSA integration boundary](SSA-INTEGRATION-BOUNDARY.md).

## October 16 development pass — evidence and case-safety improvements

The following changes have been committed to the development branch:

- **Evidence integrity:** practitioners can re-authenticate a saved encrypted original against its recorded SHA-256 and byte count. A case backup refuses to proceed if a registered encrypted original is missing, corrupt or different from its recorded metadata; orphan encrypted sources are retained rather than silently deleted.
- **Interrupted attachment recovery:** the Evidence Register can inventory authenticated ciphertext in the active case, then re-register entries missing from current in-memory metadata as **pending**. Original filenames cannot be reconstructed; recovered names are explicitly marked as such.
- **Document review provenance:** a reviewer identifier, rationale, outcome, timestamp and source SHA-256 are carried into the encrypted case snapshot when the practitioner attaches an analyzed original after entering a valid document-level review. This is **not** a clinical finding verification, SSA decision or immutable audit record.
- **Safer case transitions:** the UI asks for confirmation before changing the native unlocked vault; it refuses to switch while changes remain unsaved. Backup creation attempts to flush current encrypted edits first.
- **Source linkage:** interview answers and repeated form rows can select an indexed evidence reference, rather than requiring error-prone handwritten source IDs. Rejected sources are excluded from the selector; pending sources are shown as pending.
- **Regression gates:** new automated tests cover inventory reconciliation, document-intake mode selection, human-review metadata in draft package shapes, and native encrypted-original verification.
- **OCR scratch:** restricted Linux/WSL2 document processing now requires a verified `/dev/shm` tmpfs directory for temporary source copies and raster images. This is an improvement, **not** a PHI security certification: tmpfs may be paged to swap and external tools still require full threat review.

These changes have not completed independent security validation, full official SSA field mapping, secure enterprise roles, an approved SSA signing/submission pathway or signed Windows installers. **Do not treat this section as a declaration that the release is production ready.**

## Next acceptance milestones (in priority order)

1. **Evidence intake end-to-end:** Open a restricted case; analyze a source; attach the original encrypted blob; verify hash and review status; link reviewed evidence to relevant answers; save; reopen; back up and restore; verify bytes, provenance and rejection of a changed source. Test canceled imports, damaged files and lost/unwritable vaults. Preserve the original; never silently delete it.
2. **Case safety:** Prove clean shutdown and autosave behavior under failed writes and locked vaults; test recovery using the separate custodian credential and corrupted/partial backup. Add enforceable operator identity, roles, secure credential storage, auditable changes and retention controls before organizational rollout.
3. **SSA form completeness:** For each exact official edition, enumerate every question, conditional branch, continuation page and output widget. Validate against manually reviewed sample forms; continue labeling every incomplete PDF as unsigned draft. Do not auto-populate legal signature, banking or SSA-only fields.
4. **Signature and submission acceptance:** Maintain internal acknowledgment separation; document permitted SSA-specific signing and filing route for each form; require staff-confirmed receipt evidence and distinguish preparation, printing, transmission and acceptance.
5. **Windows release:** Reproducible ARM64 builds, code signing, upgrades/migrations, recovery drills, usability/accessibility testing, nonprofit security/privacy assessment and staff acceptance testing.

## Required test gates

Run all GitHub Actions workflows (Rust CI, Desktop checks, Local inference adapter checks, Native Tauri compile and vault tests) on the candidate commit, plus a manual Windows ARM64 launch and restore exercise. Passing CI alone is not proof of production readiness.

Only invented synthetic applicant data and non-sensitive fixtures may be committed or included in build logs, issues or PRs. A plain-text PDF filing requirement **does not remove** privacy and access-control duties for stored PHI or identity data.

## Current development disposition

**Continue prototype and acceptance testing. Do not label the application production ready, HIPAA certified, or SSA approved.** Restricted local-case functionality is a development/testing option with operator acknowledgment, not approval to import live claimant records.
