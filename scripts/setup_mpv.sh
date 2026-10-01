#!/usr/bin/env bash
# Install mpv for the Livestream QC tool when no player is found.
#
# Works in Git Bash / MSYS2 on Windows (winget, then scoop), macOS (Homebrew)
# and Linux (apt, dnf, pacman, zypper). The tool accepts mpv or mpv.net, so an
# existing mpv.net counts as installed unless --force is given.
#
# Usage: bash scripts/setup_mpv.sh [--force] [--dry-run]
#   --force    install mpv even if mpv / mpv.net is already present
#   --dry-run  print the install command instead of running it
set -euo pipefail

FORCE=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Tham số không hợp lệ: $arg (dùng --help)" >&2; exit 2 ;;
  esac
done

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  Darwin) OS=macos ;;
  Linux) OS=linux ;;
  *) die "Hệ điều hành chưa hỗ trợ: $(uname -s)" ;;
esac

# Local AppData as a POSIX path (Git Bash), for players installed outside PATH.
local_appdata() {
  if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$LOCALAPPDATA"
  else
    echo "$HOME/AppData/Local"
  fi
}

# Print the path of a usable player (same places livestream_qc/players.py looks), or nothing.
find_player() {
  local name candidate
  for name in mpv mpv.exe mpvnet mpvnet.exe; do
    if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
  done
  [ "$OS" = windows ] || return 0
  local appdata programfiles; appdata="$(local_appdata)"
  programfiles="/c/Program Files"
  if [ -n "${PROGRAMFILES:-}" ] && command -v cygpath >/dev/null 2>&1; then programfiles="$(cygpath -u "$PROGRAMFILES")"; fi
  # winget's shinchiro.mpv runs an installer to Program Files/MPV Player without touching PATH.
  for candidate in \
    "$appdata/Microsoft/WinGet/Links/mpv.exe" \
    "$appdata"/Microsoft/WinGet/Packages/shinchiro.mpv_*/mpv.exe \
    "$programfiles/MPV Player/mpv.exe" \
    "$programfiles/mpv/mpv.exe" \
    "$HOME/scoop/apps/mpv/current/mpv.exe" \
    "$appdata/Programs/mpv.net/mpvnet.exe"; do
    if [ -f "$candidate" ]; then echo "$candidate"; return 0; fi
  done
}

run() {
  if [ "$DRY_RUN" = 1 ]; then echo "  [dry-run] $*"; return 0; fi
  "$@"
}

as_root() {
  if [ "$(id -u)" = 0 ]; then run "$@"
  elif command -v sudo >/dev/null 2>&1; then run sudo "$@"
  else die "Cần quyền root để cài mpv (không có sudo)."
  fi
}

install_windows() {
  if command -v winget >/dev/null 2>&1 || command -v winget.exe >/dev/null 2>&1; then
    info "Cài mpv bằng winget (shinchiro.mpv)…"
    # winget exits non-zero when the package is already installed; the check below decides.
    run winget install --id shinchiro.mpv --exact --silent \
      --accept-package-agreements --accept-source-agreements || warn "winget báo lỗi, kiểm tra lại bên dưới."
    return 0
  fi
  if command -v scoop >/dev/null 2>&1; then
    info "Cài mpv bằng scoop…"
    run scoop install mpv
    return 0
  fi
  die "Không có winget hoặc scoop. Tải mpv tại https://mpv.io/installation/ hoặc mpv.net tại https://github.com/mpvnet-player/mpv.net/releases rồi chạy lại script."
}

install_macos() {
  command -v brew >/dev/null 2>&1 || die "Chưa có Homebrew. Cài tại https://brew.sh rồi chạy lại script."
  info "Cài mpv bằng Homebrew…"
  run brew install mpv
}

install_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    info "Cài mpv bằng apt…"
    as_root apt-get update
    as_root apt-get install -y mpv
  elif command -v dnf >/dev/null 2>&1; then
    info "Cài mpv bằng dnf (Fedora cần bật RPM Fusion nếu không tìm thấy gói)…"
    as_root dnf install -y mpv
  elif command -v pacman >/dev/null 2>&1; then
    info "Cài mpv bằng pacman…"
    as_root pacman -S --noconfirm mpv
  elif command -v zypper >/dev/null 2>&1; then
    info "Cài mpv bằng zypper…"
    as_root zypper --non-interactive install mpv
  else
    die "Không nhận ra trình quản lý gói. Cài mpv thủ công: https://mpv.io/installation/"
  fi
}

existing="$(find_player || true)"
if [ -n "$existing" ] && [ "$FORCE" = 0 ]; then
  ok "Đã có player: $existing"
  echo "  Không cần cài thêm. Dùng --force để vẫn cài mpv."
  exit 0
fi

info "Chưa có mpv/mpv.net${existing:+ (bỏ qua $existing vì --force)}, bắt đầu cài trên $OS."
case "$OS" in
  windows) install_windows ;;
  macos) install_macos ;;
  linux) install_linux ;;
esac

if [ "$DRY_RUN" = 1 ]; then
  ok "Dry-run xong, chưa cài gì."
  exit 0
fi

hash -r
installed="$(find_player || true)"
[ -n "$installed" ] || die "Cài xong nhưng không tìm thấy mpv. Mở terminal mới rồi chạy lại script để kiểm tra."
ok "mpv sẵn sàng: $installed"
"$installed" --version 2>/dev/null | head -n 1 | sed 's/^/  /' || true

if ! command -v ffmpeg >/dev/null 2>&1 && ! command -v ffmpeg.exe >/dev/null 2>&1; then
  warn "Chưa thấy ffmpeg trên PATH; tính năng chụp/preview HLS cần ffmpeg (Windows: winget install Gyan.FFmpeg)."
fi
if [ "$OS" = windows ]; then
  echo "  Khởi động lại 'python server.py' để server nhận mpv mới."
fi
