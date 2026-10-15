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
echo "== SOAR Desk | update, setup, launch =="

# Never reset or overwrite developer work.
if git diff --quiet && git diff --cached --quiet; then
  if git fetch origin main; then
    if ! git merge --ff-only origin/main; then
      echo "Cannot fast-forward; leaving files untouched." >&2; exit 1
    fi
  else
    echo "GitHub unreachable; using checked-out revision."
  fi
else
  echo "Local tracked modifications found; skipping Git update."
fi
# Reload updated copy after a successful update only on the first invocation.
if [[ "${SOAR_LAUNCH_UPDATED:-0}" != 1 ]]; then
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
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

cd "$ROOT/apps/desktop"
npm install --no-audit --no-fund
echo "Launching SOAR Desk (close this window to stop development session)..."
npm run tauri dev
