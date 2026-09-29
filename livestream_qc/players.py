"""Locate desktop players (mpv, mpv.net, VLC) and build their command lines."""
from __future__ import annotations

import shutil
from pathlib import Path

MPVNET_FALLBACK = Path.home() / 'AppData' / 'Local' / 'Programs' / 'mpv.net' / 'mpvnet.exe'


def find_player(include_vlc: bool = True) -> str | None:
    names = ('mpv', 'mpvnet', 'vlc') if include_vlc else ('mpv', 'mpvnet')
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return str(MPVNET_FALLBACK) if MPVNET_FALLBACK.is_file() else None


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
