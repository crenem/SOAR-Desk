# SOAR Desk — Synthetic release acceptance (Windows x86-64 / NVIDIA CUDA)

**Development beta only. Use fictional names, addresses, SSNs and medical records.**
This checklist is a repeatable operator exercise, **not** a certification, production PHI authorization or SSA acceptance.

## Build and desktop startup

1. Windows 11: `wsl -d Ubuntu-24.04` opens Ubuntu WSL2. `nvidia-smi` shows an NVIDIA GPU in Ubuntu.
2. `/usr/local/cuda-12.8/bin/nvcc --version` (or the configured `nvcc`) prints a usable CUDA compiler. On a new GPU use the toolkit version supported by the installed driver.
3. Update the repo with `cd ~/Projects/SOAR-Desk && git pull --ff-only origin main`. Double-click the **SOAR Desk - NVIDIA CUDA** shortcut. It checks/builds a CUDA-enabled llama-server and launches the Tauri UI through WSLg.
4. In Ubuntu, `curl -fsS http://127.0.0.1:8080/v1/models` lists model alias `qwen3-4b`. Verify actual GPU layer offload in the CUDA launcher log `~/.local/state/soar-desk/llama-cuda.log` and `nvidia-smi` **during a synthetic test inference**. HTTP health alone does not prove GPU offload.
5. Verify minimize, maximize/restore, native close, and window drag. No desktop update should clobber a locally modified Git checkout.

## Encrypted case and evidence

1. From Application Preparation, create a **fictional SYN- case**, choose independently held fictional practitioner and custodian passphrases, and create a `.soarvault`. Confirm new snapshots are encrypted and use opaque paths.
2. Enter sample answers, one repeating provider row and an evidence reference. Click **Save now**, close and reopen the same case. Values must survive, including review metadata and references.
3. In Document Intake, select a **fictional PDF** with known text and images. Check OCR page count and source SHA-256; Laya/Qwen output is explicitly advisory.
4. Enter a document-wide reviewer ID and rationale, select a review outcome, and attach the original to the unlocked case. It should appear under Evidence Register with source SHA-256, byte count, recorded review rationale and **pending** clinical status. Save/reopen and recheck.
5. Select **Verify encrypted original**. Confirm authenticated byte count and SHA-256 match. It must not mark an interpretation clinically verified.
6. In an interview question and a repeating-row provenance control, select the newly registered evidence reference. Confirm the exact reference is preserved after Save/reopen.
7. Create an encrypted backup. Confirm the `.soarbackup` and corresponding `.soarbackup.blobs` directory are both present. Restore using custodian credentials to a **new** vault with **new** practitioner/custodian secrets; inspect the recovered original and verify its digest.
8. Simulate interrupted import *only on expendable synthetic test data*: attach a second source, then close before its metadata is saved or remove its reference while leaving encrypted bytes. Reopen and use **Recover unregistered encrypted originals**. It must add an entry as **pending** with an **unknown original filename**, without generating a plaintext copy.
9. For a negative backup check on a **disposable duplicate test vault**, temporarily rename one referenced `.soarblob` to make it unavailable. A backup must refuse incomplete evidence. Restore the exact file before continuing. Never perform this test on actual organizational records.
10. Attempt a case switch with dirty changes. The application must warn/refuse before losing unsaved changes. A canceled unlock must leave the prior active case intact.

## Application and delivery boundaries

1. Progress navigation must jump to mapped missing questions; check keyboard focus on a missing field.
2. Check SSA-16 edition/fingerprint verification with the official original blank form; exported working drafts must remain visibly **UNSIGNED — INCOMPLETE**. Do not interpret mapped progress as completeness against all SSA questions.
3. Internal electronic acknowledgment must identify signer intent and bound document/case digest, while explicitly stating it is **not** an accepted SSA-827 or SSA filing signature.
4. Submission tracker records staff-entered events only. It must never claim SSA accepted a packet absent a separately obtained official receipt.
5. In restricted local-case mode, document OCR must use a verified memory-backed Linux `/dev/shm` scratch filesystem or **fail closed**; this does not prove PHI-safe deployment because tmpfs may swap to disk and all other privacy controls still need review.

## Automated gates and release decision

Require success on **Rust CI**, **Desktop checks**, **Local inference adapter checks**, and **Native Tauri compile and vault tests** for the *same commit*. Those are build/regression gates, not security certification. Record actual Windows x86-64/CUDA operator test outcomes and any defects privately. Never attach claimant data to a public issue.

**Block production release** until an organizational security assessment; authenticated roles, independent audit, credential/retention controls; complete form edition/field verification; SSA-accepted signature/filing routes; migration tests; and a signed, reproducible installer are complete.
