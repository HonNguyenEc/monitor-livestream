"""Process, logging, and file helpers shared across the toolkit."""
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def run(cmd: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)


def spawn(cmd: list[str]) -> subprocess.Popen:
    """Start a background process without a console window or attached pipes."""
    return subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


def terminate(proc: subprocess.Popen | None) -> None:
    if proc and proc.poll() is None:
        proc.terminate()


def safe_error(text: str) -> str:
    # Avoid persisting signed stream URLs, cookies, or tokens in result logs.
    text = re.sub(r'https?://\S+', '[url]', text)
    text = re.sub(r'(?i)(cookie|token|authorization|signature)([=: ]+)\S+', r'\1\2[redacted]', text)
    return text.strip()[-1200:]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def timestamp() -> str:
    return datetime.now().strftime('%Y%m%d_%H%M%S')


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def console_log(event: str, key: str, message: str = '') -> None:
    stamp = datetime.now().astimezone().isoformat(timespec='seconds')
    suffix = f' | {message}' if message else ''
    line = f'[{stamp}] [{key}] {event}{suffix}'
    try:
        print(line, flush=True)
    except UnicodeEncodeError:  # console without UTF-8 (e.g. redirected on Windows): never crash a worker
        print(line.encode('ascii', 'backslashreplace').decode(), flush=True)
