# Windows ARM64: start GenieX without modifying security or network configuration.
$ErrorActionPreference = "Stop"
$port = 18181
$url = "http://127.0.0.1:$port/v1/models"
$geniex = Get-Command geniex -ErrorAction SilentlyContinue
if (-not $geniex) {
    Write-Host "GenieX not installed; SOAR Desk will use the WSL CPU backend."
    exit 0
}
try {
    $null = Invoke-RestMethod -Uri $url -TimeoutSec 3
    Write-Host "GenieX local server is already running."
    exit 0
} catch {
    $occupied = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($occupied) {
        Write-Warning "Port $port is occupied but did not return a model list; CPU fallback will be used."
        exit 0
    }
}
$logDir = Join-Path $env:LOCALAPPDATA "SOAR Desk\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Write-Host "Starting the locally installed GenieX server on Windows ARM64..."
try {
    $proc = Start-Process -FilePath $geniex.Source -ArgumentList @("serve") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "geniex-out.log") -RedirectStandardError (Join-Path $logDir "geniex-error.log")
    for ($i=0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) {
            Write-Warning "GenieX server exited. CPU fallback remains available. Review logs under $logDir."
            exit 0
        }
        try {
            $null = Invoke-RestMethod -Uri $url -TimeoutSec 2
            Write-Host "GenieX server ready at $url."
            exit 0
        } catch {}
    }
    Write-Warning "GenieX did not become ready in 60 seconds. CPU fallback remains available."
} catch {
    Write-Warning "GenieX startup was unsuccessful: $($_.Exception.Message). CPU fallback remains available."
}
exit 0
