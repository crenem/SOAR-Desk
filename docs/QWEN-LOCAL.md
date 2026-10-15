# Qwen3 4B — local clinical extraction preview

Synthetic test documents **only**. No encryption, access control, audited approval, or use with real PHI.

## Provision Qwen3 4B on Ubuntu WSL2 ARM64

Build the official llama.cpp server using Ubuntu development tools:

```bash
sudo apt update
sudo apt install -y cmake build-essential libcurl4-openssl-dev
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target llama-server -j 4
```

Start the server in a **separate** Ubuntu terminal. On first launch, the `-hf` option downloads the Q4_K_M official Apache-2.0 weights from Hugging Face; this is **only model provisioning**, not a client-data upload.

```bash
cd ~/Projects/llama.cpp
./build/bin/llama-server -hf Qwen/Qwen3-4B-GGUF:Q4_K_M \
  --host 127.0.0.1 --port 8080 -c 4096 -ngl 0
```

After downloading the model, configure the server to load the cached GGUF using `-m /absolute/path/to/model.gguf` for reliably offline startups. The Qwen worker never talks to Hugging Face or to a remote service; it only calls the loopback llama.cpp endpoint. Treat even loopback HTTP as development-only until the local service is authenticated and hardened.

Run SOAR Desk in another WSL terminal:

```bash
cd ~/Projects/SOAR-Desk/apps/desktop
npm run tauri dev
```

The document intake pipeline uses Laya to classify each passage, then Qwen to propose structured clinical findings with exact input quotations. Unsupported quotations are discarded; proposals remain human-review-only. If the Qwen server is not running, Laya and OCR continue operating, and Qwen errors are visible.

**Resource note:** Your Snapdragon X machine has 16 GB RAM. A 4-bit Qwen3 4B model with context cache, Laya and WSL may trigger memory pressure; use -c 2048 or close other programs if necessary. CPU inference is the baseline; Qualcomm NPU is NOT implemented by this feature.
