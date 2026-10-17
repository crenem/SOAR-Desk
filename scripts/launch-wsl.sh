#!/usr/bin/env bash
# SOAR Desk development launcher. Synthetic test documents only.
set -Eeuo pipefail
ROOT="$HOME/Projects/SOAR-Desk"
LLAMA="$HOME/Projects/llama.cpp"
MODEL_REPO="Qwen/Qwen3-4B-GGUF:Q4_K_M"
PORT=8080
mkdir -p "$HOME/.local/state/soar-desk"
LOG="$HOME/.local/state/soar-desk/llama-server.log"
cd "$ROOT"
# Synchronize once, then execute the newly fetched launcher without a second fetch.
if [[ "${SOAR_LAUNCH_UPDATED:-0}" != 1 ]]; then
  echo "== SOAR Desk | update, setup, launch =="
  if git diff --quiet && git diff --cached --quiet; then
    if git fetch origin main; then
      if ! git merge --ff-only origin/main; then
        echo "Cannot fast-forward; leaving files untouched." >&2
        exit 1
      fi
    else
      echo "GitHub unreachable; using checked-out revision."
    fi
  else
    echo "Local tracked modifications found; skipping Git update."
  fi
  SOAR_LAUNCH_UPDATED=1 exec bash "$ROOT/scripts/launch-wsl.sh"
fi

for program in git curl cmake gcc pkg-config tesseract pdftotext pdftoppm; do
  if ! command -v "$program" >/dev/null 2>&1; then
    echo "Missing system dependencies; Ubuntu may request sudo password."
    sudo apt-get update
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
      git curl ca-certificates cmake build-essential pkg-config libcurl4-openssl-dev \
      poppler-utils tesseract-ocr tesseract-ocr-eng python3-venv
    break
  fi
done

# NVM is needed when opening WSL noninteractively from a Windows shortcut.
export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then source "$NVM_DIR/nvm.sh"; fi
if ! command -v npm >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  [[ -s "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
fi
if ! command -v npm >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "Node/npm or Rust/Cargo missing. Complete initial Rust + nvm setup before launching." >&2; exit 1
fi

if [[ ! -x "$ROOT/.venv-laya/bin/python" ]]; then
  echo "Installing local Python environment for Laya..."
  python3 -m venv "$ROOT/.venv-laya"
fi
if ! "$ROOT/.venv-laya/bin/python" -c "import laya" >/dev/null 2>&1; then
  "$ROOT/.venv-laya/bin/python" -m pip install 'laya>=0.3.21'
fi

# Checkpoints are downloaded once, then used offline by the document worker.
LAYA_MARKER="$HOME/.local/state/soar-desk/laya-provisioned"
if [[ ! -f "$LAYA_MARKER" ]]; then
  echo "Provisioning Laya English and multilingual checkpoints (first run only)..."
  if "$ROOT/.venv-laya/bin/python" -c 'from laya import Router; Router(device="cpu").preload(["english", "multilingual"])'; then
    touch "$LAYA_MARKER"
  else
    echo "Laya model setup failed. See docs/OCR-QUICKSTART.md. Continuing with Qwen and OCR." >&2
  fi
fi

# The SSA-16 rendering preview is offline after its dependencies and the
# unchanged public template are cached; failure here cannot block app startup.
if ! "$ROOT/.venv-laya/bin/python" -c 'import fitz' >/dev/null 2>&1; then
  echo "Installing local PDF form renderer (PyMuPDF), once..."
  "$ROOT/.venv-laya/bin/python" -m pip install 'pymupdf>=1.24,<1.27' \
    || echo "PDF form preview unavailable until PyMuPDF is installed." >&2
fi
# SSA's public site can return HTTP 403 to scripts while its PDF remains
# accessible in a user's browser. Never retry that blocked request on every
# application launch. The reviewed source can be imported through the app's
# own native file picker in Draft package -> Install SSA-16 PDF from file.
if [[ ! -f "$ROOT/.local/ssa-templates/ssa-16-bk.pdf" ]]; then
  echo "SSA-16 PDF template not cached. After launch: Draft package -> Install SSA-16 PDF from file."
fi

server_pid=""
if [[ "${SOAR_LAUNCH_ACCELERATOR:-}" == "cuda" ]]; then
  # The separate x86-64 CUDA launcher has started and verified our local model.
  # Do not replace it with GenieX or launch a second, CPU-only llama.cpp.
  if ! curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "CUDA launcher selected, but the local model server is not ready on port $PORT." >&2
    exit 1
  fi
  echo "Using dedicated NVIDIA CUDA llama.cpp backend on port $PORT."
  export SOAR_QWEN_BACKEND=cpu
elif python3 "$ROOT/scripts/probe-geniex.py"; then
  echo "GenieX GGUF passed a real JSON-generation test from WSL2."
  echo "Using GenieX local inference; the actual GPU/NPU/CPU execution device is not verified by this probe."
  echo "Skipping separate Linux CPU model startup to conserve memory."
  export SOAR_QWEN_BACKEND=auto
else
  echo "GenieX generation readiness failed; selecting Linux CPU fallback for this launch."
  echo "This does not imply GenieX is offline. A running server can return zero-token responses."
  echo "For diagnostics: python3 \"$ROOT/scripts/probe-geniex.py\"; restart GenieX on Windows if zero-token output persists."
  export SOAR_QWEN_BACKEND=cpu
  if [[ ! -x "$LLAMA/build/bin/llama-server" ]]; then
    mkdir -p "$(dirname "$LLAMA")"
    if [[ ! -d "$LLAMA/.git" ]]; then
      git clone --depth 1 https://github.com/ggml-org/llama.cpp.git "$LLAMA"
    fi
    cmake -S "$LLAMA" -B "$LLAMA/build" -DCMAKE_BUILD_TYPE=Release
    cmake --build "$LLAMA/build" --target llama-server -j 4
  fi
  
  # llama.cpp downloads its GGUF automatically on the first run, then caches it.
  # Check for an already-running *healthy* local service, not just an open port.
  server_pid=""
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "Existing local model service detected on port $PORT."
  else
    if (echo >/dev/tcp/127.0.0.1/$PORT) >/dev/null 2>&1; then
      echo "Port $PORT is in use by an unknown service; refusing to reuse it." >&2; exit 1
    fi
    echo "Starting local Qwen3 4B server (first launch downloads model weights)..."
    "$LLAMA/build/bin/llama-server" -hf "$MODEL_REPO" --host 127.0.0.1 \
      --port "$PORT" -c 2048 -ngl 0 >"$LOG" 2>&1 &
    server_pid=$!
    for ((i=0; i<900; i++)); do
      if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
        echo "Qwen server is ready."
        break
      fi
      if ! kill -0 "$server_pid" 2>/dev/null; then
        echo "Qwen server stopped. Last log lines:" >&2
        tail -n 35 "$LOG" >&2
        exit 1
      fi
      if (( i == 899 )); then
        echo "Model setup timed out. Check $LOG" >&2
        exit 1
      fi
      sleep 1
    done
  fi
  
fi

cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

cd "$ROOT/apps/desktop"
npm install --no-audit --no-fund
echo "Launching SOAR Desk (close this window to stop development session)..."
npm run tauri dev
