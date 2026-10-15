# Local document ingestion — synthetic test data only

## Ubuntu 24.04 ARM64 prerequisites
```bash
sudo apt update
sudo apt install -y poppler-utils tesseract-ocr tesseract-ocr-eng python3-venv
pdfinfo -v
tesseract --version
```

## Laya local provision
```bash
cd ~/Projects/SOAR-Desk
python3 -m venv .venv-laya
.venv-laya/bin/python -m pip install laya
```

Laya downloads a checkpoint on the first successful invocation. **Provision using invented text before enabling offline use.** The worker deliberately sets offline flags to forbid checkpoint downloads while analyzing documents. On Linux ARM64, PyTorch wheels / model support vary: verify the installed stack locally. The application displays a failure when the model isn't installed instead of silently using a different classifier.

## Local development flow
```bash
cd ~/Projects/SOAR-Desk/apps/desktop
npm install
npm run tauri dev
```

The document screen is for fictional samples. It uses the system Poppler and Tesseract binaries. No records are saved; source text and annotations exist only during the current application session. **The process has no security hardening adequate for actual health records.**

## Technical limitations
- PDF pages with fewer than 40 text characters are rasterized and OCRed; mixed pages with longer embedded text will not yet receive supplemental OCR.
- Rasterizer/Tesseract dependencies are external local executables and must be installed manually.
- Laya answers are proposals; they cannot update accepted evidence without explicit review.
- Never import production PHI or real applicant records during this sprint.


## First-use checkpoint error: LocalEntryNotFoundError

SOAR Desk intentionally sets HF_HUB_OFFLINE=1 during document classification. First provision the model online, outside the application, from the repository root:

\`\`\`bash
cd ~/Projects/SOAR-Desk
env -u HF_HUB_OFFLINE -u TRANSFORMERS_OFFLINE \
  .venv-laya/bin/python -c \
  'from laya import Router; Router(device="cpu").preload(["english"]); print("Laya English checkpoint is ready.")'
\`\`\`

This download should use only model files, not client documents. Later classifications are offline and use the cached weights. If you need multilingual classification, separately preload the multilingual checkpoint.
