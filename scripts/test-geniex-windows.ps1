# Test the GenieX GGUF NPU path on a Snapdragon X Windows ARM64 device.
# Does not affect SOAR Desk's existing CPU backend. Synthetic prompts only.
$ErrorActionPreference = "Stop"
$model = "unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0"
Write-Host "SOAR Desk — GenieX GGUF Q4_0 NPU test"
if ($env:PROCESSOR_ARCHITECTURE -ne "ARM64") {
  Write-Warning "Open the native ARM64 version of PowerShell."
  exit 2
}
if (-not (Get-Command geniex -ErrorAction SilentlyContinue)) {
  throw "GenieX CLI is not on PATH. Open a fresh PowerShell session after installing."
}
& geniex --version
if ($LASTEXITCODE -ne 0) { throw "GenieX version check failed." }
Write-Host "Using llama.cpp GGUF Q4_0 instead of the QAIRT W4A16 bundle (known initialization crash)."
Write-Host "Downloading the separate model when not already cached..."
& geniex pull $model
if ($LASTEXITCODE -ne 0) { throw "GGUF model pull failed." }
Write-Host "Running NPU inference on a fictional test note..."
& geniex infer $model --compute npu --max-tokens 80 --prompt "Summarize this fictional medical note in one sentence: Jane Doe reports back pain when standing for more than 20 minutes. Her doctor recommends physical therapy."
if ($LASTEXITCODE -ne 0) {
  throw "GGUF NPU test failed. Preserve the existing WSL CPU backend."
}
Write-Host "Generation completed. Check Task Manager NPU metrics to confirm actual hardware use before enabling NPU-first routing."
