"""Local HLS preview: restream a resolved source through FFmpeg for the dashboard."""
from __future__ import annotations

import subprocess
import threading
import time
from pathlib import Path

from .config import STREAMS_DIR, TIMEOUT
from .media import hls_command
from .resolvers import resolve
from .utils import spawn, terminate


class HlsStreams:
    def __init__(self, root: Path = STREAMS_DIR):
        self.root = root
        self._lock = threading.RLock()
        self._procs: dict[str, subprocess.Popen] = {}
        self._available: set[str] = set()

    def mark_available(self, key: str) -> None:
        with self._lock:
            self._available.add(key)

    def is_available(self, key: str) -> bool:
        with self._lock:
            return key in self._available

    def is_running(self, key: str) -> bool:
        with self._lock:
            proc = self._procs.get(key)
        return bool(proc and proc.poll() is None)

    def start(self, key: str, shop: dict) -> tuple[dict, int]:
        """Resolve the shop and start FFmpeg; return (json_payload, http_status)."""
        try:
            urls, detail = resolve(shop, TIMEOUT)
        except Exception as exc:
            return {'error': str(exc)[:1000]}, 502
        if not urls:
            return {'error': detail, 'status': 'probe_inconclusive'}, 409

        folder = self.root / key
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob('*'):
            if old.is_file():
                old.unlink()
        try:
            proc = spawn(hls_command(urls[0], folder / 'index.m3u8', TIMEOUT))
        except OSError as exc:
            return {'error': f'ffmpeg_start_failed: {exc}'}, 500
        with self._lock:
            previous = self._procs.get(key)
            self._procs[key] = proc
            self._available.add(key)
        terminate(previous)

        time.sleep(1.5)
        if proc.poll() is not None:
            return {'error': 'ffmpeg_exited_early; check stream access and codec support'}, 502
        return {'url': f'/streams/{key}/index.m3u8'}, 200

    def stop(self, key: str) -> None:
        with self._lock:
            proc = self._procs.pop(key, None)
        terminate(proc)
