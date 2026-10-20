# Installs a SECOND Windows shortcut. Does not modify SOAR Desk's existing links.
# From Ubuntu/WSL use:
# powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w scripts/create-windows-development-shortcut.ps1)"
[CmdletBinding()]
param(
  [ValidateSet('Auto', 'Cuda')]
  [string] $Accelerator = 'Auto',
  [string] $Distribution = 'Ubuntu-24.04'
)

$ErrorActionPreference = 'Stop'
$devBranch = 'development/local'

& wsl.exe -d $Distribution -e /bin/true | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "WSL distribution '$Distribution' is unavailable. Run wsl -d $Distribution first."
}

# WSL's direct `printenv HOME` may return empty when invoked from
# PowerShell launched inside WSL. A login shell resolves HOME from passwd.
$homeLines = @(& wsl.exe -d $Distribution -e bash -lc 'echo "$HOME"')
$homeExitCode = $LASTEXITCODE
$linuxHome = @($homeLines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1)
if ($homeExitCode -ne 0 -or $linuxHome.Count -ne 1) {
  throw 'Could not determine the Ubuntu home folder from its login shell.'
}
$linuxHome = ([string]$linuxHome[0]).Trim().TrimEnd('/')
if (-not $linuxHome.StartsWith('/')) {
  throw 'Unexpected Ubuntu HOME path; refusing to create a shortcut.'
}
$devRoot = "$linuxHome/Projects/SOAR-Desk-SSA"
$launcher = "$devRoot/scripts/launch-development.sh"

& wsl.exe -d $Distribution -e test -f $launcher
if ($LASTEXITCODE -ne 0) {
  throw "Development launcher missing at $launcher. Switch the SSA worktree to origin/$devBranch first."
}

# Do not rely on nested WSL git's PowerShell LASTEXITCODE here.
# On Windows ARM64/WSL that exit code can report failure despite an accurate
# stdout branch name, rejecting a valid checkout. The *Linux launcher* checks
# the active Git branch before updating or starting the application, and fails
# closed if it is not development/local. The installer never switches branches.

$launcherDir = Join-Path $env:LOCALAPPDATA 'SOAR Desk'
New-Item -ItemType Directory -Path $launcherDir -Force | Out-Null
$cmdPath = Join-Path $launcherDir 'Launch SOAR Desk Development.cmd'

$cmdLines = @(
  '@echo off',
  'title SOAR Desk - Development',
  'rem Separate Ubuntu worktree, login profile, WebView identity and localhost UI port.',
  "wsl.exe -d $Distribution -e /bin/true",
  'if errorlevel 1 goto failed'
)
if ($Accelerator -eq 'Auto') {
  # GenieX is optional on Windows ARM64. WSL's launcher checks it and
  # falls back to a local CPU model if it is unavailable.
  $geniexScript = Join-Path $PSScriptRoot 'start-geniex-windows.ps1'
  if (Test-Path -LiteralPath $geniexScript) {
    $cmdLines += ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $geniexScript + '"')
  }
}
$mode = $Accelerator.ToLowerInvariant()
$cmdLines += @(
  ('wsl.exe -d ' + $Distribution + ' -e env SOAR_DEV_ACCELERATOR=' + $mode + ' bash "' + $launcher + '"'),
  'if errorlevel 1 goto failed',
  'exit /b 0',
  ':failed',
  'echo.',
  'echo SOAR Desk Development could not start. Review the messages above.',
  'echo Your original SOAR Desk installation and case files were not modified by this launcher.',
  'pause',
  'exit /b 1'
)
$cmdLines -join [Environment]::NewLine | Set-Content -LiteralPath $cmdPath -Encoding ASCII

$desktop = [Environment]::GetFolderPath('Desktop')
if ([string]::IsNullOrWhiteSpace($desktop) -or !(Test-Path -LiteralPath $desktop)) {
  throw 'Could not locate your Windows Desktop.'
}
$shortcutPath = Join-Path $desktop 'SOAR Desk - Development.lnk'
$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcutPath)
$link.TargetPath = $cmdPath
$link.WorkingDirectory = $launcherDir
$link.Description = "SOAR Desk preview from $devBranch ($Accelerator). Separate training profile."
$link.IconLocation = "$env:SystemRoot\System32\shell32.dll,70"
$link.Save()

Write-Host "Created: $shortcutPath"
Write-Host "Tracks: origin/$devBranch (fast-forward-only; skips updates if local changes exist)"
Write-Host "Worktree: $devRoot"
Write-Host "Mode: $Accelerator"
Write-Host "Development login/profile: isolated. New profile enrollment may be needed."
Write-Host "Case vaults are user-selected. Use a DIFFERENT synthetic case file; do not open production cases in this preview."
Write-Host "Existing SOAR Desk shortcut and repository were not changed."
