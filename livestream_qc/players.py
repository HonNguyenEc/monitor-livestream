"""Locate desktop players (mpv, mpv.net, VLC) and build their command lines."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

LOCAL_APPDATA = Path(os.environ.get('LOCALAPPDATA') or Path.home() / 'AppData' / 'Local')
PROGRAM_FILES = Path(os.environ.get('ProgramFiles') or r'C:\Program Files')
MPVNET_FALLBACK = LOCAL_APPDATA / 'Programs' / 'mpv.net' / 'mpvnet.exe'
UNINSTALL_KEY = r'Software\Microsoft\Windows\CurrentVersion\Uninstall'


def _registered_mpv() -> list[Path]:
    """mpv.exe of installers that register in 'Apps & features' but do not touch PATH
    (winget's shinchiro.mpv installs to C:\\Program Files\\MPV Player)."""
    try:
        import winreg
    except ImportError:  # not Windows
        return []
    found = []
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            root = winreg.OpenKey(hive, UNINSTALL_KEY)
        except OSError:
            continue
        with root:
            for i in range(winreg.QueryInfoKey(root)[0]):
                try:
                    with winreg.OpenKey(root, winreg.EnumKey(root, i)) as app:
                        name = str(winreg.QueryValueEx(app, 'DisplayName')[0])
                        location = str(winreg.QueryValueEx(app, 'InstallLocation')[0])
                except OSError:
                    continue
                if 'mpv' in name.lower() and location:
                    found.append(Path(location) / 'mpv.exe')
    return found


def _installed_off_path() -> list[Path]:
    """Windows installs (scripts/setup_mpv.*) that are not on PATH, or not yet for a running server."""
    winget = LOCAL_APPDATA / 'Microsoft' / 'WinGet'
    return [winget / 'Links' / 'mpv.exe', *sorted(winget.glob('Packages/shinchiro.mpv_*/mpv.exe')),
            PROGRAM_FILES / 'MPV Player' / 'mpv.exe', PROGRAM_FILES / 'mpv' / 'mpv.exe', *_registered_mpv(),
            Path.home() / 'scoop' / 'apps' / 'mpv' / 'current' / 'mpv.exe', MPVNET_FALLBACK]


def find_player(include_vlc: bool = True) -> str | None:
    names = ('mpv', 'mpvnet', 'vlc') if include_vlc else ('mpv', 'mpvnet')
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return next((str(p) for p in _installed_off_path() if p.is_file()), None)


def _exe(player: str) -> str:
    return Path(player).name.lower()


def open_command(player: str, url: str) -> list[str]:
    """One-shot playback command for the desktop_player approach."""
    name = _exe(player)
    if name == 'mpv.exe':
        return [player, '--force-window=yes', '--title=Livestream QC PoC', url]
    if name == 'vlc.exe':
        return [player, '--play-and-exit', url]
    # mpv.net is the Windows GUI distribution of mpv and accepts a media URL.
    return [player, url]


def mpv_instance_args(player: str, config_dir: Path) -> list[str]:
    """Arguments that give each shop its own independent mpv window."""
    config_dir.mkdir(parents=True, exist_ok=True)
    args = ['--config-dir=' + str(config_dir)]
    if _exe(player) == 'mpvnet.exe':
        # mpv.net defaults to one process and forwards new URLs to its existing window.
        args.append('--process-instance=multi')
    elif _exe(player) == 'mpv.exe':
        args.append('--no-terminal')
    return args
