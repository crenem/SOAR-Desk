# GenieX localhost text-generation test for Windows PowerShell 5.1+.
# Run: powershell -ExecutionPolicy Bypass -File scripts\diagnose-geniex.ps1
# Synthetic requests only. No processes killed; no files or data saved.
param([string]$Base = "http://127.0.0.1:18181/v1")
$ErrorActionPreference = "Stop"
Write-Host "=== SOAR Desk | Windows GenieX diagnostics ==="
try {
    $uri = [uri]$Base
    if ($uri.Host -notin @("127.0.0.1", "localhost") -or $uri.Port -ne 18181 -or $uri.Scheme -ne "http") {
        throw "Only local GenieX on HTTP port 18181 is permitted."
    }
    $listeners = @(Get-NetTCPConnection -LocalPort 18181 -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) { throw "No listening process on TCP 18181." }
    foreach ($listener in $listeners) {
        $proc = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $listener.OwningProcess)
        if ($proc) {
            Write-Host ("Listener PID={0}; Executable={1}" -f $proc.ProcessId, $proc.Name)
        }
    }
    $models = Invoke-RestMethod -Method Get -Uri "$Base/models" -TimeoutSec 15
    $ids = @($models.data | ForEach-Object { $_.id } | Where-Object { $_ })
    if ($ids.Count -eq 0) { throw "Model registry returned no model IDs." }
    Write-Host ("Model IDs: " + ($ids -join "; "))
    $candidate = @($ids | Where-Object { $_ -eq "unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_0" } | Select-Object -First 1)
    if ($candidate.Count -eq 0) {
        Write-Host "SOAR Desk's expected Qwen3 Instruct Q4_0 model is not listed."
        exit 3
    }
    $model = [string]$candidate[0]
    $successful = 0
    $minimalWorked = $false
    $explicitThinkFailed = $false
    foreach ($thinkingFlag in @($null, $false)) {
        $payload = @{
            model = $model
            stream = $false
            max_tokens = 128
            temperature = 0.7
            messages = @(@{ role = "user"; content = "Synthetic diagnostic: say HELLO." })
        }
        if ($null -ne $thinkingFlag) { $payload["enable_think"] = $thinkingFlag }
        $label = if ($null -eq $thinkingFlag) { "Minimal request" } else { "Explicit enable_think=false" }
        Write-Host ("--- " + $label + " ---")
        try {
            $json = $payload | ConvertTo-Json -Depth 8 -Compress
            $response = Invoke-RestMethod -Method Post -Uri "$Base/chat/completions" -ContentType "application/json" -Body $json -TimeoutSec 120
            $choice = @($response.choices)[0]
            $answer = [string]$choice.message.content
            Write-Host ("finish_reason={0}; completion_tokens={1}; text_length={2}" -f $choice.finish_reason, $response.usage.completion_tokens, $answer.Length)
            if ($answer.Trim()) {
                Write-Host ("Assistant sample: " + $answer.Substring(0, [Math]::Min(120, $answer.Length)))
                $successful++
                if ($null -eq $thinkingFlag) { $minimalWorked = $true }
            } else {
                if ($null -ne $thinkingFlag) { $explicitThinkFailed = $true }
                Write-Host "Assistant output was empty."
            }
        } catch {
            Write-Host ("Inference request error: " + $_.Exception.Message)
        }
    }
    if ($minimalWorked -and $explicitThinkFailed) {
        Write-Host "RESULT: GenieX GGUF succeeds when enable_think is OMITTED, but returns empty output when explicitly false."
        Write-Host "SOAR Desk should omit enable_think for this GGUF backend; restart the app after updating."
        exit 0
    }
    if ($successful -gt 0) {
        Write-Host "RESULT: Windows GenieX HTTP can generate text. Compare with WSL2."
        exit 0
    }
    Write-Host "RESULT: Windows GenieX HTTP accepted requests but generated no text."
    Write-Host ("Next try direct model inference in a separate terminal: geniex infer " + $model + " --think=false --compute cpu")
    Write-Host "If that works, restart/inspect the existing GenieX server. If not, examine GGUF/runtime and debug logs."
    exit 4
} catch {
    Write-Host ("Diagnostic error: " + $_.Exception.Message)
    exit 1
}
