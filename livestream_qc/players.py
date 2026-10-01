"""Locate desktop players (mpv, mpv.net, VLC) and build their command lines."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

LOCAL_APPDATA = Path(os.environ.get('LOCALAPPDATA') or Path.home() / 'AppData' / 'Local')
MPVNET_FALLBACK = LOCAL_APPDATA / 'Programs' / 'mpv.net' / 'mpvnet.exe'


def _installed_off_path() -> list[Path]:
    """Windows installs (scripts/setup_mpv.sh) that a server started earlier cannot see on PATH yet."""
    winget = LOCAL_APPDATA / 'Microsoft' / 'WinGet'
    return [winget / 'Links' / 'mpv.exe', *sorted(winget.glob('Packages/shinchiro.mpv_*/mpv.exe')),
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
