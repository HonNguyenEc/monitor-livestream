"""Process, logging, and file helpers shared across the toolkit."""
from __future__ import annotations

import json
import re
import subprocess
from urllib.parse import urlparse
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


# ---- masking: identifiers shown on the dashboard or written to the console ----

def mask_email(email: str) -> str:
    """'admin@ecentric.vn' -> 'ad•••@ecentric.vn'."""
    local, at, domain = str(email or '').partition('@')
    if not local:
        return ''
    return f"{local[:2] if len(local) > 3 else local[:1]}•••{at}{domain}"


def mask_url(url: str) -> str:
    """Keep scheme and parent domain, hide the service host: 'https://aut•••.ecentric.vn'."""
    parsed = urlparse(str(url or ''))
    host = parsed.hostname or ''
    if not host:
        return ''
    if host in ('localhost', '127.0.0.1', '::1'):
        return f'{parsed.scheme}://{host}'
    labels = host.split('.')
    if all(label.isdigit() for label in labels):  # IP address
        masked = f'{labels[0]}.•••.•••.{labels[-1]}'
    else:
        masked = '.'.join([labels[0][:3] + '•••', *labels[1:]][-3:]) if len(labels) > 1 else labels[0][:3] + '•••'
    return f'{parsed.scheme}://{masked}'


def mask_id(value) -> str:
    """Long ids (session, brand) keep only their last 4 characters: '•••6215'."""
    text = str(value or '')
    return f'•••{text[-4:]}' if len(text) > 4 else text


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
