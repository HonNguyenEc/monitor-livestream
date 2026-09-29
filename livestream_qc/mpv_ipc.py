"""Talk to a running mpv (or mpv.net) window over its JSON IPC pipe, so checks need no extra process."""
from __future__ import annotations

import json
import threading
from pathlib import Path

IPC_TIMEOUT = 3  # seconds to wait for mpv to answer one command


def ipc_path(key: str) -> str:
    return rf'\\.\pipe\livestream-qc-{key}'


def _request(pipe: str, command: list) -> dict | None:
    """Send one command and return mpv's reply, or None if mpv is unreachable or silent."""
    result: dict = {}

    def talk() -> None:
        try:
            with open(pipe, 'r+b', buffering=0) as conn:
                conn.write(json.dumps({'command': command, 'request_id': 1}).encode() + b'\n')
                buffer = b''
                while True:
                    chunk = conn.read(4096)
                    if not chunk:
                        return
                    buffer += chunk
                    *lines, buffer = buffer.split(b'\n')
                    for line in lines:
                        # Event notifications share the pipe; only the reply carries our request_id.
                        message = json.loads(line or b'{}')
                        if message.get('request_id') == 1:
                            result.update(message)
                            return
        except (OSError, ValueError):
            return

    thread = threading.Thread(target=talk, daemon=True)
    thread.start()
    thread.join(IPC_TIMEOUT)
    return result or None


def get_property(pipe: str, name: str):
    reply = _request(pipe, ['get_property', name])
    return reply.get('data') if reply and reply.get('error') == 'success' else None


def frames_shown(pipe: str) -> int:
    """Video frames mpv has displayed so far; 0 while nothing has been shown."""
    return int(get_property(pipe, 'estimated-frame-number') or 0)


def screenshot(pipe: str, dest: Path) -> bool:
    """Save the frame currently shown in the mpv window to `dest`."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    reply = _request(pipe, ['screenshot-to-file', str(dest), 'video'])
    return bool(reply and reply.get('error') == 'success')
