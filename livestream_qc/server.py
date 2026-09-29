"""Local dashboard HTTP server for the livestream QC feasibility PoC."""
from __future__ import annotations

import json
import mimetypes
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .approaches import METHODS, run_approach
from .config import HOST, MPV_CHECKS_DIR, PORT, STREAMS_DIR, WEB_DIR, find_shop, load_shops, shop_key, \
    shop_label, shop_platform, shopee_cookie_for
from .monitor import LiveMonitor
from .mpv_retry import MpvRetryManager
from .shop_store import ShopError, delete_shop, save_shop
from .streams import HlsStreams
from .utils import safe_error

KEY = r'([a-zA-Z0-9_-]+)'


class Dashboard:
    """Server-side state shared by all request threads."""

    def __init__(self):
        self.streams = HlsStreams()
        self.mpv = MpvRetryManager()
        self.monitor = LiveMonitor(self.mpv)

    def snapshot(self) -> dict:
        shops = []
        for shop in load_shops():
            platform, key = shop_platform(shop), shop_key(shop)
            shops.append({'key': key, 'platform': platform, 'label': shop_label(shop),
                          'stream_available': self.streams.is_available(key), 'streaming': self.streams.is_running(key),
                          'config': shop, 'cookie_set': platform == 'shopee' and bool(shopee_cookie_for(shop)),
                          **self.mpv.status(key)})
        return {'shops': shops, 'monitoring': self.monitor.running}


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
        if path.startswith('/api/mpv/frame/'):
            target = len(parts) == 4 and _safe_file(MPV_CHECKS_DIR, [parts[3], 'latest.jpg'], {'.jpg'})
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

    def _read_json(self) -> dict:
        length = int(self.headers.get('Content-Length') or 0)
        if not 0 < length <= 64_000:
            return {}
        try:
            data = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def _form_result(self, action, success_message: str):
        """Run a config edit and reply with {success, message, data?}."""
        try:
            data = action()
        except ShopError as exc:
            return self.send_json({'success': False, 'message': str(exc)}, 400)
        except (OSError, ValueError) as exc:
            return self.send_json({'success': False, 'message': f'Không lưu được cấu hình: {exc}'}, 500)
        self.send_json({'success': True, 'message': success_message, **({'data': data} if data else {})})

    def post_shop_save(self):
        body = self._read_json()
        original = body.get('original_key') or None
        self._form_result(lambda: save_shop(body.get('shop') or {}, original),
                          'Đã cập nhật shop.' if original else 'Đã thêm shop.')

    def post_shop_delete(self, key: str):
        self.app.streams.stop(key)
        self.app.mpv.stop(key)
        self._form_result(lambda: delete_shop(key), 'Đã xoá shop.')

    def _shop_or_404(self, key: str) -> dict | None:
        shop = find_shop(key)
        if not shop:
            self.send_json({'error': 'shop_not_found'}, 404)
        return shop

    def post_monitor_start(self):
        platforms = {str(p).lower() for p in self._read_json().get('platforms') or []}
        if not platforms:
            return self.send_json({'error': 'Chưa chọn nền tảng để theo dõi.'}, 400)
        self.app.monitor.start(platforms)
        self.send_json({'monitoring': True})

    def post_monitor_stop(self):
        self.app.monitor.stop()
        self.send_json({'monitoring': False})

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
        if shop:
            self.send_json(self.app.mpv.start(key, shop))

    def post_mpv_stop(self, key: str):
        self.app.mpv.stop(key)
        self.send_json({'stopped': True})


POST_ROUTES = [
    (r'/api/monitor/start', Handler.post_monitor_start),
    (r'/api/monitor/stop', Handler.post_monitor_stop),
    (r'/api/shops/save', Handler.post_shop_save),
    (rf'/api/shops/delete/{KEY}', Handler.post_shop_delete),
    (rf'/api/approach/({"|".join(METHODS)})/{KEY}', Handler.post_approach),
    (rf'/api/play/{KEY}', Handler.post_play),
    (rf'/api/stop/{KEY}', Handler.post_stop),
    (rf'/api/mpv/start/{KEY}', Handler.post_mpv_start),
    (rf'/api/mpv/stop/{KEY}', Handler.post_mpv_stop),
]


def main() -> None:
    STREAMS_DIR.mkdir(exist_ok=True)
    Handler.app = Dashboard()
    print(f'Livestream QC demo: http://{HOST}:{PORT}')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
