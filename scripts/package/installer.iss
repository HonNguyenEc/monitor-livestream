; Built by scripts/package/build-installer.mjs, which passes these defines.
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef ExeName
  #error ExeName is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef OutputBaseFilename
  #error OutputBaseFilename is required
#endif

#define AppName "Live QC"
#define AppPublisher "eCentric"
#define AppFolder "LiveQC"
#define RunValueName "LiveQC"
#define ServiceExitTimeoutMs 5000
#define ServiceExitPollMs 500

[Setup]
; Never change AppId: upgrades and uninstall find the existing install through it.
AppId={{DDD94C28-92DA-4D87-BCBF-D591C77436E8}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#AppFolder}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#ExeName}
UninstallDisplayName={#AppName}
; PrepareToInstall stops the service itself; Restart Manager cannot close a process without windows.
CloseApplications=no

[CustomMessages]
ServiceStillRunning=Không dừng được Live QC đang chạy ({#ExeName}). Hãy tắt nó trong Task Manager rồi chạy lại Setup.
DeleteDataPrompt=Xóa luôn dữ liệu Live QC trên máy này (danh sách kênh, đăng nhập backend, log)?

[InstallDelete]
Type: filesandordirs; Name: "{app}\swagger-ui"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#RunValueName}"; ValueData: """{app}\{#ExeName}"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#ExeName}"; Flags: nowait

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /FI ""USERNAME eq {username}"" /IM {#ExeName}"; Flags: runhidden; RunOnceId: "StopService"

[Code]
procedure StopService;
var
  ResultCode: Integer;
begin
  // Without the user filter, an admin running Setup would also stop other users' instances.
  Exec(ExpandConstant('{sys}\taskkill.exe'), ExpandConstant('/F /FI "USERNAME eq {username}" /IM {#ExeName}'), '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function ServiceRunning: Boolean;
var
  ResultCode, I: Integer;
  Output: TExecOutput;
begin
  Result := False;
  // A tasklist that cannot run must not block every install.
  if not ExecAndCaptureOutput(ExpandConstant('{sys}\tasklist.exe'), ExpandConstant('/NH /FI "USERNAME eq {username}" /FI "IMAGENAME eq {#ExeName}"'), '', SW_HIDE, ewWaitUntilTerminated, ResultCode, Output) then
    Exit;
  // tasklist exits 0 and prints a localized notice when nothing matches, so look for the name.
  for I := 0 to GetArrayLength(Output.StdOut) - 1 do
    if Pos(Lowercase('{#ExeName}'), Lowercase(Output.StdOut[I])) > 0 then
    begin
      Result := True;
      Exit;
    end;
end;

// taskkill returns once termination is requested; the image stays locked until the process is gone.
function WaitForServiceExit: Boolean;
var
  Waited: Integer;
begin
  Waited := 0;
  while ServiceRunning do
  begin
    if Waited >= {#ServiceExitTimeoutMs} then
    begin
      Log(Format('%s still running after %d ms', ['{#ExeName}', Waited]));
      Result := False;
      Exit;
    end;
    Sleep({#ServiceExitPollMs});
    Waited := Waited + {#ServiceExitPollMs};
  end;
  Log(Format('%s not running after waiting %d ms', ['{#ExeName}', Waited]));
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopService;
  if WaitForServiceExit then
    Result := ''
  else
    Result := CustomMessage('ServiceStillRunning');
end;

// The [UninstallRun] taskkill alone races file deletion; stop and wait before any file is removed.
function InitializeUninstall: Boolean;
begin
  StopService;
  Result := WaitForServiceExit;
  if not Result then
    SuppressibleMsgBox(CustomMessage('ServiceStillRunning'), mbError, MB_OK, IDOK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and
     (SuppressibleMsgBox(CustomMessage('DeleteDataPrompt'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES) then
  begin
    DelTree(ExpandConstant('{localappdata}\{#AppFolder}\data'), True, True, True);
    RemoveDir(ExpandConstant('{localappdata}\{#AppFolder}'));
  end;
end;
