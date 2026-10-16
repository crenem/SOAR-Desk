# SOAR Desk working-app checklist (October 2026)

SOAR Desk now includes a restricted local-case route, but this is **not a completed, validated nonprofit deployment**. Its electronic signature capture is an internal acknowledgment, not an SSA-recognized electronic signature. The complete release target is a nonprofit-owned, mostly single-practitioner desktop application with organizational recovery and form-accurate SSA workflows.

## Available working slices

- **Windows-style controls:** custom Tauri title bar has minimize, maximize/restore, drag and close; close protects dirty unlocked cases.
- **Left progress micro-navigation:** form and section coverage with jump-to-missing questions. Progress is limited to questions currently mapped in the app, not an assertion that every required SSA question is complete.
- **Case workspace:** encrypted local case snapshots, separate nonprofit recovery credential, 10-second encrypted autosave, encrypted backup/restore and a restricted local-case consent route in addition to fictional demos. The current whole-file vault is not a production SQLCipher database.
- **Electronic acknowledgment:** drawn or typed signer intent, identified signer/authority, review and disclosure statement, timestamp and snapshot hash, and stale-signature handling. The acknowledgement is not an SSA click-and-sign or certified third-party signature.
- **Source documents:** PDF/OCR analysis, human-approved prefill proposals, and an Evidence Register that can now **Attach encrypted source** to an unlocked writable case, record the SHA-256 and blob ID, and export decrypted source files only after a clear warning. Encrypted case backups include attached blobs.

## Case evidence acceptance smoke test

1. Open **Application preparation → Case files** and unlock a writable .soarvault. Select **Evidence register**, then add an evidence reference.
2. Select **Attach encrypted source…** and choose a local PDF or image. The source is copied under the active vault's encrypted .blobs directory; the original source is **not deleted or encrypted in-place**.
3. Verify the evidence reference shows the original filename, byte length and SHA-256 prefix. Wait for encrypted autosave or click **Save now** before closing.
4. Create an encrypted .soarbackup and check that it contains the matching encrypted blob folder.
5. To produce an ordinary PDF for the actual filing channel, select **Export decrypted copy…** and explicitly confirm the warning. The destination must be new, and the resulting plaintext file is the nonprofit's responsibility to handle.
6. Do not mark evidence verified solely because it was encrypted or its text was classified by a model; verify against the source.

## Critical capabilities still not certified as complete

1. **Full source-exact SSA field inventories and print-ready forms:** mapped interviews and SSA-16 preview do not yet prove full SSA-16, SSA-8000, SSA-3368, SSA-827, SSA-3369, and SSA-3373 paper-form parity. Each official edition must be inspected and regression-tested, and required disclosures/authorized signatures must be handled per form.
2. **Production identity and recovery:** named nonprofit operator, organizational custodian identity, key management and recovery procedure, Windows OS-backed protection, roles and audit safeguards.
3. **Production persistence/security:** an evaluated encrypted case database and protected document store with tested restore, retention, corruption recovery, data minimization and independent external verification.
4. **Document intake workflow:** connect newly ingested documents directly to case attachment and evidence metadata in one supported workflow, persist analysis/review provenance, support more document types and mapping to medical providers/treatments.
5. **Electronic-signature acceptance:** SSA-specific policy, consent text, signer authentication/authority, approved channels, audit and an accepted electronic filing adapter. A locally drawn image is **not** automatically accepted on SSA-827.
6. **Deployment and support:** signed Windows installer, tested ARM64 target, accessible UI review, migration/version upgrade testing, backup and disaster recovery exercises, practical staff acceptance testing and nonprofit procedures.

### Deployment position

Ordinary completed SSA PDFs are often handled as human-readable documents in authorized filing channels. That does **not** waive the separate duties to protect private medical and identity information at rest or during extraction, storage, backup and transmission. Never send sensitive PDFs by unapproved plaintext email or assume that an unsigned locally generated PDF is filed. Distinguish **can edit and print locally** from **ready for a nonprofit to use for real applicants** and **accepted by SSA**.

The current restricted local mode requires an explicit operator acknowledgment and remains an **unreviewed local development deployment**. Do not describe it as independently verified HIPAA compliance, SSA certification, or production authorization.
