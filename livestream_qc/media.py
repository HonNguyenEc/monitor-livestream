"""FFmpeg operations: frame capture, single-frame checks, and HLS restreaming."""
from __future__ import annotations

import subprocess
import time
from pathlib import Path

from .utils import run, safe_error

FFMPEG = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y']


def capture(url: str, out_dir: Path, seconds: int, interval: int, timeout: int) -> dict:
    """Read `seconds` of the stream and save one JPEG every `interval` seconds."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [*FFMPEG, '-rw_timeout', str(timeout * 1_000_000), '-i', url, '-t', str(seconds),
           '-vf', f'fps=1/{interval}', '-q:v', '3', str(out_dir / 'frame_%02d.jpg')]
    started = time.monotonic()
    try:
        p = run(cmd, seconds + timeout)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': 'ffmpeg_timeout', 'duration_seconds': round(time.monotonic() - started, 2)}
    frames = sorted(out_dir.glob('frame_*.jpg'))
    ok = p.returncode == 0 and bool(frames)
    return {'ok': ok, 'frame_count': len(frames), 'duration_seconds': round(time.monotonic() - started, 2),
            'error': None if ok else safe_error(p.stderr or f'ffmpeg exited {p.returncode}')}


def grab_frame(url: str, dest: Path, rw_timeout: int = 5, timeout: int = 7) -> int | None:
    """Save a single frame to `dest`; return its size in bytes, or None if no image arrived."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [*FFMPEG, '-rw_timeout', str(rw_timeout * 1_000_000), '-i', url, '-frames:v', '1', str(dest)]
    try:
        p = run(cmd, timeout)
    except (subprocess.TimeoutExpired, OSError):
        return None
    if p.returncode == 0 and dest.is_file() and dest.stat().st_size > 0:
        return dest.stat().st_size
    return None


def hls_command(url: str, playlist: Path, timeout: int) -> list[str]:
    """FFmpeg command that re-encodes a live source into a rolling local HLS playlist."""
    return [*FFMPEG, '-rw_timeout', str(timeout * 1_000_000), '-i', url,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-c:a', 'aac',
            '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
            '-hls_flags', 'delete_segments+append_list+independent_segments', str(playlist)]
