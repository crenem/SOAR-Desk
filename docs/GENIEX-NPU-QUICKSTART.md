# SOAR Desk: Windows GenieX NPU and WSL2 integration

Status: **prototype pending validation of Windows-to-WSL server interoperability**. Use synthetic records only.

## Known-good hardware inference

On Snapdragon X X1-26-100 with GenieX CLI v0.8.0, the following model successfully performed NPU inference at 14.6 tokens/sec in a short synthetic test:

```powershell
geniex infer unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0 --compute npu --max-tokens 80 --prompt "Summarize a fictional patient follow-up visit."
```

The separate `ai-hub-models/Qwen3-4B-Instruct-2507` QAIRT bundle previously crashed with `0xc00000fd`; do not use it for SOAR Desk. Only the approved Unsloth GGUF Q4_0 model is selected by the NPU adapter.

## Test GenieX server access

1. In **Windows PowerShell**, run `geniex serve` and leave it open.
2. In **Ubuntu WSL2**, test the loopback HTTP API:

```bash
curl --max-time 5 http://127.0.0.1:18181/v1/models
```

If this fails, it is likely because WSL2 is using NAT networking. Microsoft documents that Windows-to-WSL localhost forwarding works by default, but **WSL-to-Windows localhost** requires mirrored networking. See https://learn.microsoft.com/windows/wsl/networking .

3. In Windows, open `notepad $env:USERPROFILE\.wslconfig` and add the following to its existing `[wsl2]` section (create the section only if absent):

```ini
[wsl2]
networkingMode=mirrored
```

4. Close running Ubuntu apps and execute `wsl --shutdown` in Windows PowerShell. Restart Ubuntu and retest the same `curl` command. Do **not** bind the model server to 0.0.0.0 or disable the firewall merely to get WSL working.
5. Once the API is reachable, run the synthetic preflight in Ubuntu:

```bash
cd ~/Projects/SOAR-Desk
python3 scripts/probe-geniex.py
```

This test loads the **exact GGUF model** via the GenieX OpenAI-compatible server, ensuring that the integrated workflow can make a local request. Observe Task Manager NPU utilization during the test to confirm the server is actually accelerating on Hexagon.

## One-click startup

The Windows desktop shortcut setup is in `scripts/create-windows-shortcut.ps1`. It creates a launcher which attempts to start `geniex serve` on Windows, then runs `scripts/launch-wsl.sh`. WSL runs a synthetic model preflight:

- If the GenieX GGUF endpoint responds, it **prefers Windows GenieX** and skips loading the CPU GGUF to conserve memory.
- If the NPU service isn't reachable, the existing **Ubuntu CPU llama.cpp** backend is started as before.
- The Qwen worker reports `backend: npu` or `backend: cpu` and accepts only local 127.0.0.1 endpoints; document findings always require human verification.
- The runtime worker may fall back to an already-running CPU service. If none is running and GenieX fails **after startup**, restart the launcher to initiate the CPU startup fallback.

The launcher does not change WSL networking or Windows security settings, and does not automatically download additional Windows model weights.

## Limitations

- Using the correct model ID in a server response does not independently prove the server chose the NPU. Verify the Task Manager trace during a real synthetic HTTP inference.
- No production PHI, client documents, or other identifying data.
- Version compatibility, JSON response formatting, and record-level accuracy require validation with synthetic cases.
- The Qwen GGUF served by GenieX and the Ubuntu llama.cpp model can produce different proposed findings. Compare results and retain source quotations and reviewer oversight.
