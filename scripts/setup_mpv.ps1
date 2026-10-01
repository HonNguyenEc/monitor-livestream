<#
.SYNOPSIS
  Install mpv for the Livestream QC tool when no player is found (Windows PowerShell 5.1+).

.DESCRIPTION
  Same behaviour as scripts/setup_mpv.sh for Windows: the tool accepts mpv or mpv.net, so an
  existing one counts as installed unless -Force is given. Installs mpv with winget
  (shinchiro.mpv), else scoop.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup_mpv.ps1
  powershell -ExecutionPolicy Bypass -File scripts\setup_mpv.ps1 -Force -DryRun
#>
param(
  [switch]$Force,   # install mpv even if mpv / mpv.net is already present
  [switch]$DryRun   # print the install command instead of running it
)
$ErrorActionPreference = 'Stop'

function Info($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "!   $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "X   $msg" -ForegroundColor Red; exit 1 }

$LocalAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData\Local' }

# Same places livestream_qc/players.py looks: PATH first, then installs a running shell cannot see yet.
function Find-Player {
  foreach ($name in 'mpv', 'mpvnet') {
    $cmd = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
  }
  $candidates = @(Join-Path $LocalAppData 'Microsoft\WinGet\Links\mpv.exe')
  $candidates += Get-ChildItem (Join-Path $LocalAppData 'Microsoft\WinGet\Packages') -Directory -Filter 'shinchiro.mpv_*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'mpv.exe' }
  # winget's shinchiro.mpv runs an installer to Program Files\MPV Player without touching PATH.
  $programFiles = if ($env:ProgramFiles) { $env:ProgramFiles } else { 'C:\Program Files' }
  $candidates += Join-Path $programFiles 'MPV Player\mpv.exe'
  $candidates += Join-Path $programFiles 'mpv\mpv.exe'
  $candidates += Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                                  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like '*mpv*' -and $_.InstallLocation } |
    ForEach-Object { Join-Path $_.InstallLocation 'mpv.exe' }
  $candidates += Join-Path $HOME 'scoop\apps\mpv\current\mpv.exe'
  $candidates += Join-Path $LocalAppData 'Programs\mpv.net\mpvnet.exe'
  foreach ($path in $candidates) { if (Test-Path $path -PathType Leaf) { return $path } }
  return $null
}

function Invoke-Step([string]$exe, [string[]]$arguments) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($arguments -join ' ')"; return 0 }
  & $exe @arguments | Out-Host  # keep the installer's output out of the return value
  return $LASTEXITCODE
}

$existing = Find-Player
if ($existing -and -not $Force) {
  Ok "Đã có player: $existing"
  Write-Host '  Không cần cài thêm. Dùng -Force để vẫn cài mpv.'
  exit 0
}

$skipped = if ($existing) { " (bỏ qua $existing vì -Force)" } else { '' }
Info "Chưa có mpv/mpv.net$skipped, bắt đầu cài."

if (Get-Command winget -ErrorAction SilentlyContinue) {
  Info 'Cài mpv bằng winget (shinchiro.mpv)...'
  # winget exits non-zero when the package is already installed; the check below decides.
  $code = Invoke-Step 'winget' @('install', '--id', 'shinchiro.mpv', '--exact', '--silent',
                                 '--accept-package-agreements', '--accept-source-agreements')
  if ($code -ne 0) { Warn "winget trả mã $code, kiểm tra lại bên dưới." }
} elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
  Info 'Cài mpv bằng scoop...'
  $null = Invoke-Step 'scoop' @('install', 'mpv')
} else {
  Fail 'Không có winget hoặc scoop. Tải mpv tại https://mpv.io/installation/ hoặc mpv.net tại https://github.com/mpvnet-player/mpv.net/releases rồi chạy lại.'
}

if ($DryRun) { Ok 'Dry-run xong, chưa cài gì.'; exit 0 }

$installed = Find-Player
if (-not $installed) { Fail 'Cài xong nhưng không tìm thấy mpv. Mở PowerShell mới rồi chạy lại script để kiểm tra.' }
Ok "mpv sẵn sàng: $installed"
try { (& $installed --version 2>$null | Select-Object -First 1) | ForEach-Object { Write-Host "  $_" } } catch { }

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Warn 'Chưa thấy ffmpeg trên PATH; tính năng chụp/preview HLS cần ffmpeg (winget install Gyan.FFmpeg).'
}
Write-Host "  Khởi động lại 'python server.py' để server nhận mpv mới."
