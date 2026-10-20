#!/usr/bin/env bash
# NVIDIA CUDA launcher for SOAR Desk on Windows x86-64 / Ubuntu WSL2.
# Restricted development beta: use synthetic information for testing.
set -Eeuo pipefail

ROOT="${SOAR_DESK_ROOT:-$HOME/Projects/SOAR-Desk}"
LLAMA="$HOME/Projects/llama.cpp"
PORT=8080
MODEL_REPO="Qwen/Qwen3-4B-GGUF:Q4_K_M"
STATE="$HOME/.local/state/soar-desk"
LOG="$STATE/llama-cuda.log"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ ! -f "$ROOT/scripts/launch-wsl.sh" ]]; then
  echo "SOAR Desk was not found at $ROOT. Clone https://github.com/crenem/SOAR-Desk.git first." >&2
  exit 1
fi
mkdir -p "$STATE"
cd "$HOME"
for bin in git cmake curl python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing prerequisite: $bin. Install SOAR Desk Ubuntu development dependencies." >&2
    exit 1
  fi
done

if ! command -v nvidia-smi >/dev/null 2>&1 && [[ ! -x /usr/lib/wsl/lib/nvidia-smi ]]; then
  echo "NVIDIA GPU access unavailable in WSL2. Update the Windows NVIDIA driver and check WSL2." >&2
  exit 1
fi

# Reuse an already-running server rather than replacing unknown user processes.
if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "Existing Qwen service found at 127.0.0.1:$PORT."
  echo "Its CUDA configuration cannot be inferred from a healthy HTTP response; inspect nvidia-smi."
else
  if (echo >/dev/tcp/127.0.0.1/$PORT) >/dev/null 2>&1; then
    echo "Port $PORT is occupied by an unavailable/unidentified service; refusing to replace it." >&2
    exit 1
  fi
  NVCC="$(command -v nvcc || true)"
  for candidate in /usr/local/cuda-12.8/bin/nvcc /usr/local/cuda/bin/nvcc; do
    if [[ -z "$NVCC" && -x "$candidate" ]]; then NVCC="$candidate"; fi
  done
  if [[ -z "$NVCC" ]]; then
    echo "CUDA compiler nvcc not found. Complete the CUDA toolkit installation in Ubuntu first." >&2
    echo "For a CUDA 12.8 install, check: /usr/local/cuda-12.8/bin/nvcc --version" >&2
    exit 1
  fi
  if [[ ! -d "$LLAMA/.git" ]]; then
    mkdir -p "$(dirname "$LLAMA")"
    git clone --depth 1 https://github.com/ggml-org/llama.cpp.git "$LLAMA"
  fi
  if [[ ! -x "$LLAMA/build/bin/llama-server" ]] || \
     ! grep -q '^GGML_CUDA:BOOL=ON$' "$LLAMA/build/CMakeCache.txt" 2>/dev/null; then
    echo "Building NVIDIA CUDA llama.cpp (first run can take time)..."
    cmake -S "$LLAMA" -B "$LLAMA/build" \
      -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON -DCMAKE_CUDA_COMPILER="$NVCC"
    cmake --build "$LLAMA/build" --target llama-server -j 4
  fi
  echo "Starting local Qwen3 4B CUDA inference (first run downloads the model)..."
  "$LLAMA/build/bin/llama-server" -hf "$MODEL_REPO" --alias qwen3-4b \
    --host 127.0.0.1 --port "$PORT" -c 4096 -ngl 99 >"$LOG" 2>&1 &
  server_pid=$!
  ready=0
  for ((attempt=0;attempt<900;attempt++)); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      echo "CUDA Qwen server stopped during startup. Recent log:" >&2
      tail -n 45 "$LOG" >&2
      exit 1
    fi
    sleep 1
  done
  if ((ready == 0)); then
    echo "CUDA model did not become ready. See $LOG" >&2
    exit 1
  fi
fi

# Refuse to send document data to an unrelated service on the model port.
models="$(curl -fsS --max-time 5 "http://127.0.0.1:$PORT/v1/models")" || {
  echo "Could not inspect the local model at port $PORT." >&2
  exit 1
}
if ! printf '%s' "$models" | python3 -c 'import json,sys; items=json.load(sys.stdin).get("data",[]); sys.exit(0 if any(m.get("id")=="qwen3-4b" for m in items) else 1)'; then
  echo "Port $PORT does not serve model alias qwen3-4b. Stop the conflicting service first." >&2
  exit 1
fi

# The existing worker uses backend=cpu as the *endpoint name* for port 8080.
# CUDA inference is handled by the separate llama-server process.
echo "Launching SOAR Desk with the local Qwen server at 127.0.0.1:$PORT."
SOAR_LAUNCH_ACCELERATOR=cuda SOAR_QWEN_BACKEND=cpu bash "$ROOT/scripts/launch-wsl.sh"
