# Qualcomm GenieX Windows ARM64 NPU prototype

**Status:** Experimental, not yet validated on Snapdragon X X1-26-100. No Windows security-policy changes.

GenieX supports Windows ARM64, a local OpenAI-compatible HTTP server at 127.0.0.1:18181, and the NPU-only `ai-hub-models/Qwen3-4B` model via QAIRT. This bundle is distinct from the existing Ubuntu Qwen3-4B GGUF model. Review the official instructions: https://github.com/qualcomm/GenieX and https://github.com/qualcomm/GenieX/blob/main/docs/en/models/supported.mdx

## Phase 1 — prove the actual NPU works (Windows)

1. Download the **Windows ARM64** GenieX installer from the official repository and check its Windows code signature. No test-signing, Secure Boot, or Smart App Control changes.
2. Open **Windows ARM64 PowerShell** and run the repository script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "\\wsl.localhost\Ubuntu-24.04\home\jseaux\Projects\SOAR-Desk\scripts\test-geniex-windows.ps1"
```

3. It pulls `ai-hub-models/Qwen3-4B` and runs `geniex infer ai-hub-models/Qwen3-4B --compute npu` on a **fictional** prompt.
4. Observe Task Manager → Performance → NPU 0. A successful command is necessary but not sufficient to establish NPU utilization. Record any device/runtime errors and model output.

## Phase 2 — local server interoperability

In a separate **Windows ARM64** terminal:

```powershell
geniex serve
```

GenieX defaults to `http://127.0.0.1:18181`. The model must be pulled first. Test its `/v1/models` and `/v1/chat/completions` interfaces with invented content. Verify it is serving the NPU-compatible QAIRT model rather than a CPU/GGUF fallback. Verify which model identifier to send with requests by examining `/v1/models`. Do not assume a successful HTTP response indicates NPU acceleration.

## Phase 3 — WSL2 integration (conditional)

The existing Qwen worker uses `127.0.0.1:8080` for the Ubuntu CPU llama.cpp server. WSL2 and Windows **do not necessarily share localhost**, particularly under default NAT networking. Do not expose medical-record prompts over a network or bind GenieX to `0.0.0.0` as a workaround.

Only after the Windows NPU model and local server have been verified should we add an authenticated, loopback-only Windows↔WSL transport (e.g. tested mirrored networking or a tightly scoped local IPC bridge) and enable NPU-first routing in SOAR Desk. Until then the one-click launcher must continue to run the existing **CPU fallback** unchanged.

No real clinical information, PHI, SSNs, or production records during this prototype.

## Observed on Windows ARM64 (October 2026)

The `ai-hub-models/Qwen3-4B-Instruct-2507` QAIRT W4A16 bundle downloads correctly but can crash on model initialization with Windows exception `0xc00000fd` (stack overflow) at `geniex_llm_create` on Snapdragon X. See [upstream GenieX issue #1471](https://github.com/qualcomm/GenieX/issues/1471) and [issue #1509](https://github.com/qualcomm/GenieX/issues/1509), the latter specifically documenting slow QAIRT bundle decode on Snapdragon X X1-26-100.

The repository's `scripts/test-geniex-windows.ps1` now tests the alternative `unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0` on `--compute npu` (llama.cpp Hexagon backend), **not** the crashing QAIRT bundle. The alternative requires a separate approximately 2.38 GB GGUF download and must be confirmed with a live hardware test; it is not verified solely by successful compilation or download. Before testing, shut down the resource-intensive WSL SOAR Desk session if it is running, using `wsl --shutdown`. Do not enable automatic NPU-first routing until the GGUF hardware test succeeds and local interprocess communication has been validated.

