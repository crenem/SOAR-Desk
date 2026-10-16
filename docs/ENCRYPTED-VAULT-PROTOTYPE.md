# SOAR Desk synthetic sealed-case vault v1

**Implemented 2026-10-16; SYNTHETIC DEVELOPMENT DATA ONLY. NOT approved for real client PHI/PII.**

SOAR Desk can now save a fictional in-memory case interview and evidence/submission metadata in a password-protected encrypted `.soarvault` file, reopen it into the UI, create an authenticated ciphertext-copy `.soarbackup`, and simulate the nonprofit's separate recovery/reassignment mechanism. The encrypted file itself is not SQLite/SQLCipher and is not a production database.

## What works in the desktop now

Under **Application preparation → Draft package → Experimental encrypted case vault**:

1. **Create**: enter a practitioner passphrase and a separate nonprofit recovery passphrase (each at least 16 UTF-8 bytes, not identical). Choose a fresh `.soarvault` path. Rust encrypts the versioned synthetic snapshot and writes without overwriting an existing file.
2. **Unlock and load**: choose `.soarvault` or `.soarbackup`, enter the practitioner passphrase, and confirm replacement of the current in-memory fictional case. Restores shared interview questions, program selection, repeatable rows, evidence references and staff-entered submission log.
3. **Encrypted backup**: authenticate with the practitioner passphrase before copying the **exact same sealed ciphertext** to a new `.soarbackup` file. No plaintext backup is written. Backups require independent off-device custody in future production operations; this preview does not organize them or confirm backup-site separation.
4. **Nonprofit recovery**: choose an original sealed vault/backup and enter the existing organization's recovery passphrase, a new practitioner's passphrase, a **new** organization's recovery passphrase, a fictional custodian identifier and recovery rationale. This produces a separately encrypted file under a new path. The organization recovery native command does **not return case contents to the UI**. The rekey event is added inside encrypted snapshot metadata, but is **not yet independently anchored**.
5. **Synthetic-only**: every operation requires an explicit fictional-data confirmation. A `SYN-` case reference is required. This is not PHI detection and cannot guarantee someone didn't paste real sensitive data.

### Format v1

- UTF-8 JSON **encrypted envelope** with `file_kind=SOAR-DESK-SYNTHETIC-SEALED-VAULT`, pinned version `1`, public synthetic reference, cipher identifier, Argon2id parameters and encrypted ciphertext.
- An independent **cryptographically random 256-bit vault master key** encrypts an entire JSON case snapshot using AES-256-GCM with a random 96-bit nonce.
- Two separately random salted Argon2id KEKs, using 64 MiB, three iterations and one lane, protect two distinct AES-256-GCM-wrapped VMK slots: `practitioner` and `organization_recovery`. Passphrases and VMKs are not written to the file.
- Authenticated associated data binds the format/version, synthetic case identifier, and whether the cipher operation concerns payload, practitioner or organization recovery.
- CSPRNG-generated salts/nonces and VMK are different on every creation/recovery. Password-derived wrapping is not equivalent to a Windows DPAPI/TPM protected key. A sufficiently weak or exposed passphrase can expose the encrypted case.
- Wrong credentials, corrupted ciphertext, changed vault ID, duplicate/missing roles, format changes and unsupported versions fail closed.
- `max plaintext=2 MiB`, `max encrypted envelope=4 MiB`; values are for bounded prototype testing, not arbitrary PDFs.
- Rust `zeroize` protects some native buffers, but React state, Tauri IPC, OS swap/crash dumps, backup disks and imported documents do **not** yet provide full key or PHI protection.

**Important:** The encrypted snapshot's *case reference* is visible in the plaintext header. In the prototype it must be a synthetic identifier; the production equivalent should use a cryptographically random opaque vault ID. Original documents are not included in the snapshot: evidence entries are references only.

### What organizational recovery can and cannot do

The original nonprofit recovery passphrase can decrypt the VMK **inside native recovery code**, then create a new VMK and re-encrypt the record using fresh practitioner and nonprofit recovery slots. The recovery API returns only new ciphertext path and success status; it does not reveal the plaintext case.

This is a separation in workflow, **not absolute cryptographic inability**: someone who possesses the actual recovery secret and independently modifies the implementation could decrypt the case. Organizational custody therefore requires procedural safeguards, limited access, separation of duty as appropriate, encrypted backups, recovery logging and key escrow governance.

**Rekey does not revoke old files or previous backups.** Old keys remain effective on any old encrypted copies. Authorized staff must track destruction/retirement and any protected exports. Recovery currently generates only an event inside the newly encrypted JSON and is not tamper-proof or independently anchored.

### Tests

Rust unit tests in `crates/soar-storage/src/sealed_vault.rs` verify:
- correct practitioner unlock and independent organization recovery separation;
- wrong password fails, including use of nonprofit secret in routine practitioner path;
- randomized encrypted outputs for identical synthetic inputs;
- changed ciphertext, header and KDF/version fail closed;
- rekey to new practitioner/new organization secret; old practitioner secret fails on the newly rewrapped file;
- unsupported snapshot types and weak/reused passphrases rejected;
- encrypted backup authenticity and wrong-key failure.

Native Rust file tests in `apps/desktop/src-tauri/src/vault_commands.rs` check no-overwrite file creation, permitted extensions, absolute-path requirements and bounded writes. A dedicated GitHub workflow compiles and tests the Tauri bridge.

### Still missing before real client data

1. Native Windows ARM64 **production build**, signed installer, platform malware/sandbox review; WSL2 dev launch is not a PHI environment.
2. **SQLCipher** database with row-level application/case data plus independently authenticated encrypted document blobs. This v1 sealed JSON prototype is not the intended working case database.
3. OS-backed key storage (DPAPI/CNG and, if appropriate, Windows Hello), secure memory exposure review and tested key rotation.
4. Actual nonprofit user identity, roles, granular case authorization, approved dual-control/escrow recovery ceremony, independent tamper-evident audit and trusted event timestamps.
5. Restorable, versioned encrypted **database + document** backups tested after simulated machine loss. The `.soarbackup` proof of concept is just a sealed synthetic JSON copy.
6. Retention, special-category disclosure enforcement (including relevant 42 CFR Part 2), signed consent policy, incident response and independent security verification.
7. Full SSA form mapping, human signatures, receipt verification and accepted filing workflows.

**Do not deploy for real applicants, even though the file is encrypted.** Encryption alone does not satisfy confidentiality, integrity, availability and administrative requirements.
