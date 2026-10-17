# SOAR Desk: local operator sign-in (development beta)

SOAR Desk has a **single operator profile** on each Ubuntu/Linux user account. This is a local application access gate, not an enterprise user directory or a completed HIPAA security program.

## First run and routine use

1. Launch the Windows WSL2 shortcut. On first use, SOAR Desk shows **Create an operator account**.
2. Choose a nonidentifying operator username (3–64 letters, numbers, hyphens, underscores or dots) and a strong unique password of at least 16 characters. Confirm the password.
3. The native desktop backend writes only an **Argon2id salted password verifier** and the username in the user-specific account directory (`~/.config/soar-desk/operator.json`, unless `XDG_CONFIG_HOME` is configured). The file is created with mode 0600 and its directory is protected with mode 0700 on Unix. The password is never stored in reversible form.
4. Sign in each time the app launches. The native case and document IPC calls require the authenticated operator session. The UI exposes **Lock SOAR Desk**; inactivity locks the operator session after 15 minutes. A timed-out session also drops the native unlocked case session; the React workspace is unmounted.
5. **A case still has its own practitioner encryption passphrase**, which is separate from the operator password. An independent nonprofit recovery passphrase is retained for rekeying a case without granting the custodian routine access. Operator sign-in does not automatically unlock or decrypt case files.
6. Locking discards unsaved in-memory edits. Use **Save now** and verify the encrypted save status before locking. Reopening after lock requires operator sign-in plus the encrypted case passphrase.

## Optional linked ZITADEL sign-in

The operator profile now has a stable internal UUID and may link a verified ZITADEL OIDC `issuer + sub` to its existing username. Configure an HTTPS issuer and a Native-app client ID under **Profile & ZITADEL**, then authenticate locally before pressing **Link ZITADEL account**. Later, the matching subject may sign in through ZITADEL without entering the local login password, but it still cannot decrypt cases without the separate practitioner passphrase. Login with a different subject, even with a matching display name/email, is refused.

The ZITADEL integration is **not** preconfigured and does not provision your ZITADEL tenant. Browser-based OIDC authentication may involve passkeys at the provider, but no Windows-native passkey is used to release local case encryption keys. See [ZITADEL setup](ZITADEL-SETUP.md).

## Security model and limitations

- Argon2id **hashes** the operator password. Encryption is applied to case vaults and their authenticated evidence blobs; a password should never be stored using reversible encryption.
- The local username and SOAR profile UUID are identifiers, **not encryption secrets**. Do not put claimant names, SSNs, or private information in it.
- The native access gate protects SOAR Desk's case and document operations. It is not a kernel-enforced file-access policy. Anyone controlling the same OS account can attempt filesystem access; per-case encryption is the remaining cryptographic boundary.
- The enrollment record is deliberately stored outside the repository; deleting/recreating local operator credentials does not decrypt the independently protected case files. It also is not a secure administrative reset or anti-tamper mechanism.
- The five-failure sign-in delay is **process-local** and resets on restart. It is not a substitute for Windows disk encryption, restricted OS users, encrypted backups, audit logging, EDR and organizational permissions.
- This Linux/WSL2 Tauri build **does not currently implement FIDO2 passkeys or Windows Hello**. WebAuthn login by itself does not derive a reliable AES key. A future native Windows release can integrate Windows Hello/TPM-protected key wrapping and a planned recovery path after platform validation.
- The single local operator does **not** provide role separation, independent audit, centralized revocation, device enrollment or organizational recovery of the sign-in password. Recovering case data still depends on the nonprofit's independent case recovery credential.
- Plaintext documents outside the case vault—including the originals supplied for ingestion and exported PDF copies—are not encrypted by this login. Store them only in approved protected locations.
- **Do not put real claimant PHI in this public development beta** until the nonprofit completes a security assessment and authorizes the deployment.

## Acceptance smoke test (synthetic records only)

1. On first run, verify the workbench is inaccessible until operator enrollment succeeds.
2. Restart. Wrong passwords must not authenticate. Correct credentials unlock the workspace, but no encrypted case is automatically opened.
3. Create a SYN- encrypted vault with separate practitioner and custodian passphrases. Save/reopen a fictional answer and encrypted document.
4. Save, then use **Lock SOAR Desk**. Case content disappears from the screen. Sign in again; the encrypted case must require its original practitioner passphrase.
5. After 15 minutes without authenticated case activity, confirm the UI returns to its sign-in state and the native case commands refuse requests.
6. Check filesystem permissions on `~/.config/soar-desk/operator.json` and confirm it contains a password-hash value, **not the password**. Never attach credentials or live case files to bug reports.
7. Confirm all four GitHub Actions workflows pass on the same commit. Passing tests does not establish passkey or production medical-records security certification.
