# Creates a one-click Windows Desktop shortcut for SOAR Desk on Ubuntu WSL2 with NVIDIA CUDA.
# Run in Windows PowerShell as your regular Windows user. No administrator privileges required.
$ErrorActionPreference = 'Stop'
$distribution = 'Ubuntu-24.04'

& wsl.exe -d $distribution -e /bin/true | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Ubuntu-24.04 is not available in WSL. Install or launch Ubuntu first using: wsl -d Ubuntu-24.04"
}

$launcherDir = Join-Path $env:LOCALAPPDATA 'SOAR Desk'
New-Item -Path $launcherDir -ItemType Directory -Force | Out-Null
$cmdPath = Join-Path $launcherDir 'Launch SOAR Desk CUDA.cmd'

$cmdContent = @'
@echo off
title SOAR Desk - NVIDIA CUDA
rem Install the repo if missing, otherwise fast-forward it BEFORE locating the CUDA launcher.
rem A fast-forward-only update protects local commits and refuses to overwrite work.
wsl.exe -d Ubuntu-24.04 --cd ~ -- bash -lc "mkdir -p ~/Projects && if [ ! -d ~/Projects/SOAR-Desk/.git ]; then git clone https://github.com/crenem/SOAR-Desk.git ~/Projects/SOAR-Desk; else git -C ~/Projects/SOAR-Desk pull --ff-only origin main; fi && test -f ~/Projects/SOAR-Desk/scripts/launch-wsl-cuda.sh && bash ~/Projects/SOAR-Desk/scripts/launch-wsl-cuda.sh"
if errorlevel 1 (
    echo.
    echo SOAR Desk could not start. Review the error above.
    echo No existing case data or model process was deleted.
    pause
)
'@
$cmdContent | Set-Content -Path $cmdPath -Encoding ASCII

$desktop = [Environment]::GetFolderPath('Desktop')
if ([string]::IsNullOrWhiteSpace($desktop) -or !(Test-Path $desktop)) {
    throw 'Could not locate your Windows Desktop folder.'
}
$shortcutPath = Join-Path $desktop 'SOAR Desk - NVIDIA CUDA.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcutPath)
$link.TargetPath = $cmdPath
$link.WorkingDirectory = $launcherDir
$link.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
$link.Description = 'Launch SOAR Desk using Ubuntu WSL2 and local NVIDIA CUDA Qwen inference'
$link.Save()
Write-Host "Created desktop shortcut: $shortcutPath"
Write-Host 'Double-click it to launch SOAR Desk. First launch may install local dependencies and download Qwen weights.'
Write-Host 'Ubuntu CUDA toolkit, Rust, Node.js and system dependencies must be installed.'
