; SOAR Desk per-user Windows installer. Case data lives outside the app install folder.
#define MyAppName "SOAR Desk"
#define MyAppVersion "0.1.1-preview.1"
#define MyAppExeName "soar-desk.exe"
[Setup]
AppId={{8D24D86B-B0B0-48AC-8306-5DBD8BE149F4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=SOAR Desk Community
DefaultDirName={localappdata}\Programs\SOAR Desk
DefaultGroupName=SOAR Desk
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\..\dist\installer
OutputBaseFilename=SOAR-Desk-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
[Files]
Source: "..\..\..\target\release\soar-desk.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\..\dist\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\SOAR Desk"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\SOAR Desk"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"
[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Open SOAR Desk"; Flags: nowait postinstall skipifsilent
