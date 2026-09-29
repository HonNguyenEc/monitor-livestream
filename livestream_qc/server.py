"""Local dashboard HTTP server for the livestream QC feasibility PoC."""
from __future__ import annotations

import json
import mimetypes
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .approaches import METHODS, run_approach
from .config import HOST, PORT, RESULTS_DIR, STREAMS_DIR, WEB_DIR, find_shop, load_config, load_shops, \
    shop_key, shop_label, shop_platform
from .mpv_retry import MpvRetryManager
from .probe import latest_report, probe_all
from .streams import HlsStreams
from .utils import safe_error

KEY = r'([a-zA-Z0-9_-]+)'


class Dashboard:
    """Server-side state shared by all request threads."""

    def __init__(self):
        self._lock = threading.RLock()
        self._refreshing = False
        self._report_dir: Path | None = None
        self._rows: dict[str, dict] = {}
        self.streams = HlsStreams()
        self.mpv = MpvRetryManager()

    def reload_latest(self) -> None:
        found = latest_report(RESULTS_DIR)
        if not found:
            return
        report_dir, report = found
        with self._lock:
            self._report_dir = report_dir
            self._rows = {f"{r.get('platform')}:{r.get('shop')}": r for r in report.get('results', [])}

    def refresh(self) -> None:
        """Start a background batch probe unless one is already running."""
        with self._lock:
            if self._refreshing:
                return
            self._refreshing = True
        threading.Thread(target=self._refresh_worker, daemon=True).start()

    def _refresh_worker(self) -> None:
        try:
            _, rows = probe_all(load_config())
            for row in rows:
                if row.get('stream_host'):
                    self.streams.mark_available(row['key'])
            self.reload_latest()
        finally:
            with self._lock:
                self._refreshing = False

    def _latest_frame(self, key: str, report_dir: Path | None) -> str | None:
        if not report_dir:
            return None
        frames = sorted((report_dir / key).glob('frame_*.jpg'))
        return f'/api/frame/{report_dir.name}/{key}/{frames[-1].name}' if frames else None

    def snapshot(self) -> dict:
        self.reload_latest()
        with self._lock:
            refreshing, report_dir, rows = self._refreshing, self._report_dir, dict(self._rows)
        shops = []
        for shop in load_shops():
            platform, label, key = shop_platform(shop), shop_label(shop), shop_key(shop)
            row = rows.get(f'{platform}:{label}', {})
            shops.append({'key': key, 'platform': platform, 'label': label, 'status': row.get('status', 'not_checked'),
                          'checked_at': row.get('checked_at'), 'error': row.get('error'),
                          'frame': self._latest_frame(key, report_dir),
                          'stream_available': self.streams.is_available(key), 'streaming': self.streams.is_running(key),
                          **self.mpv.status(key)})
        return {'shops': shops, 'refreshing': refreshing}


def _safe_file(base: Path, parts: list[str], suffixes: set[str]) -> Path | None:
    """Resolve `parts` under `base`, rejecting traversal and unexpected file types."""
    target = base.joinpath(*parts).resolve()
    if base.resolve() in target.parents and target.is_file() and target.suffix.lower() in suffixes:
        return target
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = 'LivestreamQCDemo/0.1'
    app: Dashboard

    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args))

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path):
        data = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        if path.suffix == '.m3u8':
            content_type = 'application/vnd.apple.mpegurl'
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _path(self) -> str:
        return unquote(urlparse(self.path).path)

    # ---- GET -------------------------------------------------------------

    def do_GET(self):
        path = self._path()
        if path in ('/', '/index.html'):
            return self.send_file(WEB_DIR / 'index.html')
        if path == '/api/shops':
            return self.send_json(self.app.snapshot())
        parts = path.strip('/').split('/')
        if path.startswith('/api/frame/'):
            target = len(parts) == 5 and _safe_file(RESULTS_DIR, parts[2:], {'.jpg', '.jpeg'})
            return self.send_file(target) if target else self.send_json({'error': 'frame_not_found'}, 404)
        if path.startswith('/streams/'):
            target = len(parts) == 3 and _safe_file(STREAMS_DIR, parts[1:], {'.m3u8', '.ts'})
            return self.send_file(target) if target else self.send_json({'error': 'stream_segment_not_found'}, 404)
        return self.send_json({'error': 'not_found'}, 404)

    # ---- POST ------------------------------------------------------------

    def do_POST(self):
        path = self._path()
        for pattern, action in POST_ROUTES:
            match = re.fullmatch(pattern, path)
            if match:
                return action(self, *match.groups())
        return self.send_json({'error': 'not_found'}, 404)

    def _shop_or_404(self, key: str) -> dict | None:
        shop = find_shop(key)
        if not shop:
            self.send_json({'error': 'shop_not_found'}, 404)
        return shop

    def post_refresh(self):
        self.app.refresh()
        self.send_json({'started': True})

    def post_approach(self, method: str, key: str):
        shop = find_shop(key)
        if not shop:
            return self.send_json({'error': f'Unknown shop key: {key}'}, 500)
        try:
            self.send_json(run_approach(method, shop))
        except Exception as exc:
            self.send_json({'error': safe_error(str(exc)) or 'approach_failed'}, 500)

    def post_play(self, key: str):
        shop = self._shop_or_404(key)
        if shop:
            payload, status = self.app.streams.start(key, shop)
            self.send_json(payload, status)

    def post_stop(self, key: str):
        self.app.streams.stop(key)
        self.send_json({'stopped': True})

    def post_mpv_start(self, key: str):
        shop = self._shop_or_404(key)
        if not shop:
            return
        if shop_platform(shop) != 'tiktok':
            return self.send_json({'error': 'mpv_retry_currently_tiktok_only'}, 400)
        self.send_json(self.app.mpv.start(key, shop))

    def post_mpv_stop(self, key: str):
        self.app.mpv.stop(key)
        self.send_json({'stopped': True})


POST_ROUTES = [
    (r'/api/refresh', Handler.post_refresh),
    (rf'/api/approach/({"|".join(METHODS)})/{KEY}', Handler.post_approach),
    (rf'/api/play/{KEY}', Handler.post_play),
    (rf'/api/stop/{KEY}', Handler.post_stop),
    (rf'/api/mpv/start/{KEY}', Handler.post_mpv_start),
    (rf'/api/mpv/stop/{KEY}', Handler.post_mpv_stop),
]


def main() -> None:
    STREAMS_DIR.mkdir(exist_ok=True)
    Handler.app = Dashboard()
    Handler.app.reload_latest()
    print(f'Livestream QC demo: http://{HOST}:{PORT}')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
