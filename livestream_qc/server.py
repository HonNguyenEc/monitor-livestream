"""Local dashboard HTTP server for the livestream QC feasibility PoC."""
from __future__ import annotations

import json
import mimetypes
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .approaches import METHODS, run_approach
from .backend_client import BackendError
from .backend_sync import get_sync
from .config import HOST, MPV_CHECKS_DIR, PORT, STREAMS_DIR, WEB_DIR, all_shops, find_shop, is_backend_shop, \
    shop_key, shop_label, shop_platform, shopee_cookie_for
from .monitor import LiveMonitor
from .mpv_retry import MpvRetryManager
from .shop_store import ShopError, delete_shop, save_shop
from .streams import HlsStreams
from .utils import mask_id, safe_error

KEY = r'([a-zA-Z0-9_-]+)'


class Dashboard:
    """Server-side state shared by all request threads."""

    def __init__(self):
        self.streams = HlsStreams()
        self.mpv = MpvRetryManager()
        self.monitor = LiveMonitor(self.mpv)
        self.backend = get_sync()

    def snapshot(self) -> dict:
        shops = []
        for shop in all_shops():
            platform, key = shop_platform(shop), shop_key(shop)
            row = {'key': key, 'platform': platform, 'label': shop_label(shop),
                   'source': 'backend' if is_backend_shop(shop) else 'local',
                   'stream_available': self.streams.is_available(key), 'streaming': self.streams.is_running(key),
                   'config': shop, 'cookie_set': platform == 'shopee' and bool(shopee_cookie_for(shop)),
                   **self.mpv.status(key)}
            if is_backend_shop(shop):
                brand_id = shop['brand_id']
                row.update(config={'name': shop.get('name')}, session=self.backend.session(brand_id),
                           schedules=[_public_schedule(r) for r in self.backend.schedules(brand_id)],
                           on_air_schedule=(self.backend.on_air_schedule(brand_id) or {}).get('schedule_id'))
            shops.append(row)
        return {'shops': shops, 'monitoring': self.monitor.running, 'monitor_keys': self.monitor.keys,
                'backend': self.backend.status()}


SCHEDULE_PUBLIC_FIELDS = ('schedule_id', 'platform', 'scheduled_at', 'expected_end_at', 'status', 'status_label',
                          'schedule_status')


def _public_schedule(row: dict) -> dict:
    """A schedule as the page may show it: no account id, session id masked."""
    return {**{k: row.get(k) for k in SCHEDULE_PUBLIC_FIELDS}, 'session_id': mask_id(row.get('session_id'))}


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
        if path in ('/login', '/login.html'):
            return self.send_file(WEB_DIR / 'login.html')
        if path == '/api/shops':
            return self.send_json(self.app.snapshot())
        if path == '/api/backend':
            return self.send_json(self.app.backend.status())
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
        shop = find_shop(key)
        if shop and is_backend_shop(shop):
            return self.send_json({'success': False, 'message': 'Shop đồng bộ từ backend, không xoá ở đây được.'}, 400)
        self.app.streams.stop(key)
        self.app.mpv.stop(key)
        self._form_result(lambda: delete_shop(key), 'Đã xoá shop.')

    # ---- backend connection ------------------------------------------------

    def post_backend_login(self):
        body = self._read_json()
        try:
            self.app.backend.client.login(body.get('email'), body.get('password') or '')
        except BackendError as exc:
            return self.send_json({'success': False, 'message': str(exc)}, 400)
        status = self.app.backend.sync_now()
        message = 'Đã kết nối backend.' + (f" Đồng bộ lỗi: {status['error']}" if status.get('error') else
                                           f" {status['brands']} shop Shopee API, {status['schedules']} lịch hôm nay.")
        self.send_json({'success': True, 'message': message, 'data': status})

    def post_backend_logout(self):
        self.app.backend.client.logout()
        self.app.backend.clear()
        self.send_json({'success': True, 'message': 'Đã ngắt kết nối backend.'})

    def post_backend_sync(self):
        if not self.app.backend.client.connected:
            return self.send_json({'success': False, 'message': 'Chưa đăng nhập backend.'}, 400)
        status = self.app.backend.sync_now()
        if status.get('error'):
            return self.send_json({'success': False, 'message': f"Đồng bộ lỗi: {status['error']}", 'data': status}, 502)
        self.send_json({'success': True, 'message': f"Đã đồng bộ {status['brands']} shop, {status['schedules']} lịch.",
                        'data': status})

    def _shop_or_404(self, key: str) -> dict | None:
        shop = find_shop(key)
        if not shop:
            self.send_json({'error': 'shop_not_found'}, 404)
        return shop

    def post_monitor_start(self):
        """Body: {platforms: [...], keys?: [...]}. With `keys`, only those shops are monitored;
        sent again while monitoring, it replaces the monitored set."""
        body = self._read_json()
        platforms = {str(p).lower() for p in body.get('platforms') or []}
        if not platforms:
            return self.send_json({'error': 'Chưa chọn nền tảng để theo dõi.'}, 400)
        keys = None
        if body.get('keys') is not None:
            keys = {str(k) for k in body['keys'] if re.fullmatch(KEY, str(k))}
            if not keys:
                return self.send_json({'error': 'Chưa chọn kênh nào để theo dõi.'}, 400)
        self.app.monitor.start(platforms, keys)
        self.send_json({'monitoring': True, 'monitor_keys': self.app.monitor.keys})

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
    (r'/api/backend/login', Handler.post_backend_login),
    (r'/api/backend/logout', Handler.post_backend_logout),
    (r'/api/backend/sync', Handler.post_backend_sync),
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


class DashboardHTTPServer(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR lets a second process bind a port already in use, so the
    # browser silently reaches whichever app answers first; fail loudly instead.
    allow_reuse_address = os.name != 'nt'


def main() -> None:
    STREAMS_DIR.mkdir(exist_ok=True)
    Handler.app = Dashboard()
    try:
        httpd = DashboardHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        raise SystemExit(f'Cổng {PORT} đang bị chiếm ({exc}). Tắt chương trình đang dùng cổng này '
                         f'hoặc chạy với cổng khác: $env:QC_PORT=8766; python server.py') from exc
    print(f'Livestream QC demo: http://{HOST}:{PORT}')
    httpd.serve_forever()
