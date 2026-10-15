# Run in Windows ARM64 PowerShell. Synthetic prompts only.
$ErrorActionPreference = "Stop"
Write-Host "SOAR Desk Qualcomm GenieX NPU prototype"
Write-Host "Windows architecture: $env:PROCESSOR_ARCHITECTURE"
if ($env:PROCESSOR_ARCHITECTURE -ne "ARM64") {
  Write-Warning "Not running native ARM64 PowerShell. Reopen PowerShell (ARM64)."
  exit 2
}
$exe = Get-Command geniex -ErrorAction SilentlyContinue
if (-not $exe) {
  Write-Host "GenieX is not installed. Download the Windows ARM64 installer from:"
  Write-Host "https://github.com/qualcomm/GenieX"
  Write-Host "Check its signature, install it, then reopen PowerShell and rerun this script."
  exit 2
}
Write-Host "GenieX executable: $($exe.Source)"
& geniex --version
Write-Host "Provisioning NPU-only Qwen3-4B bundle (first use downloads model files)..."
& geniex pull ai-hub-models/Qwen3-4B
if ($LASTEXITCODE -ne 0) { throw "Model provisioning failed. See above output." }
Write-Host "Starting a single interactive synthetic NPU test."
Write-Host "The QAIRT model uses the NPU only. Confirm NPU load in Task Manager during generation."
Write-Host "At the prompt, try: Summarize: Fictional patient Jane Doe attended a follow-up visit."
& geniex infer ai-hub-models/Qwen3-4B --compute npu
if ($LASTEXITCODE -ne 0) { throw "GenieX NPU inference failed. Do not enable SOAR Desk NPU mode." }
Write-Host "Interactive test returned successfully. Verify actual NPU activity in Task Manager before enabling integration."
