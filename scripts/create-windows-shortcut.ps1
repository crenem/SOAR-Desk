# Run once from Windows PowerShell. Creates or updates the desktop shortcut.
$ErrorActionPreference = "Stop"
$launcherDir = Join-Path $env:LOCALAPPDATA 'SOAR Desk'
New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null
$cmd = Join-Path $launcherDir 'Launch SOAR Desk.cmd'
@'
@echo off
title SOAR Desk
wsl.exe -d Ubuntu-24.04 --cd /home/jseaux/Projects/SOAR-Desk -- bash -lc "bash scripts/launch-wsl.sh"
if errorlevel 1 (
 echo.
 echo SOAR Desk startup failed. Review errors above.
 pause
)
'@ | Set-Content -Path $cmd -Encoding ASCII
$desktop = [Environment]::GetFolderPath('Desktop')
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'SOAR Desk.lnk'))
$link.TargetPath = $cmd
$link.WorkingDirectory = $launcherDir
$link.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
$link.Description = 'Update and launch SOAR Desk in WSL2'
$link.Save()
Write-Host "SOAR Desk shortcut ready at $desktop"
