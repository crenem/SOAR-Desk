# Case autosave, opening/exporting and document prefill

Development milestone (2026-10-16). **Fictional/synthetic test data only.** The product does not yet meet requirements to store protected personal/medical data.

## Case file workflow

The main Application Preparation screen now displays **Open / import case**, **Save / export encrypted case**, and **SSA document exports** above the interview, plus an autosave status and a **Save now** control.

After an operator **creates or unlocks a writable .soarvault file**, the desktop UI checks every 10 seconds for changed applicant answers, repeatable entries, evidence references, submission history, and organizational recovery metadata. Changed data are re-encrypted in the native Rust backend, with no browser localStorage, IndexedDB, or plaintext JSON fallback. Unchanged snapshots are not rewritten. The frontend reports whether saving is pending, completed or failed.

The native process retains the zeroizing random vault master key only for the unlocked session; it does not retain either passphrase. An updated case is encrypted using AES-256-GCM and a new nonce, then written into a synchronized temporary file and atomically replaced on the same filesystem. The previous encrypted version is kept as a .soarvault.previous file for limited local recovery. Autosave checks a digest of the original ciphertext and refuses to overwrite an externally modified file. A normal .soarbackup remains the separately requested portable encrypted backup.

**Autosave limitations:** the 10-second timer runs while the desktop application is active. A sleeping computer, closed app, failed disk write, or locked/non-writable case may interrupt it. The status is visible. Creating or unlocking a writable vault is required first because generating automatically recoverable credentials without a secure recovery setup would risk losing the nonprofit's data. No real client data is permitted until native Windows credential handling, SQLCipher, proper logging, case authorization, and encrypted documents are delivered and assessed.

Opening a .soarbackup allows import but does not activate autosave onto the backup; create a writable vault for continued editing. Organizational recovery creates a new encrypted vault, terminates ordinary editing access, and requires the replacement practitioner to unlock the recovered file separately.

## Prefill from document intake

The Document Evidence screen stays mounted when changing tabs. Only *explicitly labeled* source fields for patient name, DOB, SSN, phone, height, and weight are currently eligible for typed canonical case prefill. A practitioner must verify each proposed value against the original source and mark it **HumanVerified** first. A separate button sends these proposals to Application Preparation for a checkbox review; no data are entered automatically without affirmative selection, and existing applicant answers are never overwritten. Multiple contradictory values for the same field are withheld. Accepted suggestions cite the document SHA-256, page and candidate identifier; they remain marked as reported rather than clinical/legal verification. Source information cannot be imported into another fictional case after switching cases.

Laya/Qwen clinical summaries and diagnoses are **not automatically prefilled** because they still need specific, item-level evidence review and reliable field-level semantic mapping. Original medical document bytes are **not** saved inside this experimental vault.

## Formatters

- SSN: nine digits rendered XXX-XX-XXXX, but not an SSN validity check.
- U.S. telephone: (XXX) XXX-XXXX, while international numbers and "no reliable telephone" statements are preserved.
- Height: e.g. 5 ft 11 in or 180 cm.
- Weight: e.g. 180 lb or 82 kg.
- Dates: MM/DD/YYYY and MM/YYYY with calendar validation.

Invalid or incomplete entries remain visible with inline warnings rather than being silently deleted.

## Smoke tests (no real client information)

1. Relaunch SOAR Desk using the existing shortcut. Verify case actions are prominent.
2. Load the fictional Jane Doe example, choose **Save / export encrypted case**, and create a .soarvault with two different fictional passwords (practitioner and recovery).
3. Change an interview answer and wait 10 seconds. The top status should indicate encrypted save. Optionally click **Save now**.
4. Close the application. Use **Open / import case** and the practitioner credential. The changed answer should be restored.
5. Test .soarbackup and nonprofit recovery independently. Old encrypted copies remain readable using old credentials until deliberately retired.
6. Ingest a fictional document with individually labeled patient fields; verify those labels in the original; mark candidates HumanVerified, use **Review verified fields in Application Preparation**, and confirm/skip each field. Existing answers must remain unchanged.
7. Verify formatted SSNs, phones, height/weight, dates and warnings.
8. If a vault was modified outside the app, verify autosave halts visibly rather than silently overwriting it.

## Release blockers

The case snapshot remains an experimental encrypted JSON vault, NOT production SQLCipher database storage. Pending work includes secure local Windows credential management, a complete encrypted attachment vault, account/role authorization, offline consent and release controls, tamper-evident independent audit, a recovery/backup drill and independent security assessment. Production medical/financial client data must remain disabled until those controls pass.
