#define AppName "XJTU Course PDF"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppPublisher "XJTU Course PDF Contributors"
#define AppExeName "XJTU-Course-PDF.cmd"

[Setup]
AppId={{A7F5E5B4-36AC-4A89-9F1E-5C6A7C9A7F20}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\XJTU Course PDF
DefaultGroupName={#AppName}
OutputDir=..\release
OutputBaseFilename=XJTU-Course-PDF-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
UninstallDisplayIcon={app}\extension\manifest.json

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*;node_modules\*;.ocr-venv\*;release\*;tmp-*\*"

[Dirs]
Name: "{localappdata}\XJTU-Course-PDF\output"
Name: "{localappdata}\XJTU-Course-PDF\cache"
Name: "{localappdata}\XJTU-Course-PDF\logs"

[Icons]
Name: "{autodesktop}\XJTU 课程 PDF"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\start-xjtu.ps1"""; WorkingDir: "{app}"
Name: "{group}\启动 XJTU 课程 PDF"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\start-xjtu.ps1"""; WorkingDir: "{app}"
Name: "{group}\打开插件目录"; Filename: "{app}\extension"

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-xjtu.ps1"" -SkipNpm"; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\start-xjtu.ps1"""; Description: "启动 XJTU 课程 PDF"; Flags: postinstall nowait
