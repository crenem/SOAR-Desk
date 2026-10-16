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

## GenieX server reachable but produces zero tokens

The normal launcher checks the Windows GenieX OpenAI-compatible service on `http://127.0.0.1:18181/v1`, selects the installed GGUF Qwen3 4B model, and makes a real synthetic test request for JSON. A listed model or HTTP 200 response alone does **not** establish model readiness.

If the startup log says `finish_reason=stop, completion_tokens=0`, then the request reached GenieX but the model returned **no assistant content**. This is not a network failure, and raising `max_tokens` alone is not a demonstrated solution. The probe now makes one second attempt before declining the GenieX backend, and the document worker also retries a transient empty/invalid GenieX reply before falling back to the local CPU model.

From an Ubuntu terminal with SOAR Desk checked out, run:

```bash
cd ~/Projects/SOAR-Desk
python3 scripts/probe-geniex.py
```

If the response remains empty after both requests, **first distinguish Windows HTTP from WSL2 and the underlying GGUF runtime**. Open Windows PowerShell in the repository's Windows-accessible path and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-geniex.ps1
```

This script sends only a fictional HELLO prompt, identifies the process listening on port 18181, lists model IDs, and compares a minimal chat-completion request with one using `enable_think=false`. It does not terminate or reconfigure anything, and does not write files. If both return `finish_reason=stop` and `completion_tokens=0` from Windows as well, WSL2 is **not** the cause.

For the exact GGUF model listed in the diagnostic, run it **directly**, bypassing the server:

```powershell
geniex infer unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0 --think=false --compute cpu
```

At the interactive prompt, enter a fictional query such as `Say HELLO.`. This is a diagnostic CPU run, not a recommendation to disable NPU acceleration permanently. If direct CLI works but HTTP is blank, check the existing server instance and restart it with `geniex --log debug serve` *after confirming and stopping only the actual GenieX process occupying the port*. If direct CLI is blank too, investigate the cached GGUF file, model runtime, and GenieX version rather than altering SOAR Desk prompts. The current CLI supports `geniex infer`, `--compute`, and the global `--log` option in Qualcomm's documentation.

If the response remains empty after both requests, check the **Windows GenieX server console/logs**, terminate and restart that server, verify the GGUF model is loaded, and run the probe again. You can also test GenieX independently with this synthetic request in Windows PowerShell:

```powershell
$body = @{
    model = "unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0"
    messages = @(@{role="user";content="Say hello in one sentence."})
    max_tokens = 128
    temperature = 0.7
    enable_think = $false
    stream = $false
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18181/v1/chat/completions" -Body $body -ContentType "application/json" |
    ConvertTo-Json -Depth 7
```

Use the exact model ID listed by `GET /v1/models` if it differs from the example above. The `choices[0].message.content` must be nonempty and `usage.completion_tokens` should normally be greater than zero. If the independent PowerShell test is empty too, SOAR Desk cannot fix the model engine from WSL2; check GenieX version/runtime/model configuration and its server logs.

The launcher reports **GenieX GGUF inference selected** when the actual JSON generation probe succeeds. It does *not* claim NPU acceleration from model naming alone: the GGUF backend's device offload must be verified in GenieX itself. On a failed probe, the launcher selects Linux CPU for that run; relaunch after fixing/restarting GenieX to retest.

**Resource note:** The Snapdragon X device may have memory contention if both a GenieX model and Linux CPU llama-server are loaded. The launcher skips CPU startup when GenieX inference is healthy. With a failed probe, CPU fallback can use significant memory. The local integration still remains synthetic-only; no real patient information or external model requests are permitted.

Qualcomm references:
- https://github.com/qualcomm/GenieX/blob/main/docs/cn/run/cli/local-server.mdx
- https://github.com/qualcomm/GenieX

