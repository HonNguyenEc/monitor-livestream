"""Admin connection to the auto_lives backend: login, token refresh, and the reads the QC tool needs.

The password is only forwarded to the backend's /auth/login; what is kept on disk
(`backend_session.json`, git-ignored) is the token pair, refreshed in place.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from .config import BACKEND_SESSION_PATH, TIMEOUT
from .utils import console_log, mask_email, mask_url

# The backend comes from configuration only (.env / environment), never from the login form.
BACKEND_URL_ENV = 'AUTO_LIVES_BACKEND_URL'
DEFAULT_BACKEND_URL = 'http://localhost:8000'
API_PREFIX = '/api/v1'
# Only admins see every brand and its schedules; a shop account would silently get a partial list.
ADMIN_ROLES = {'admin', 'super_admin'}


class BackendError(Exception):
    def __init__(self, message: str, status: int = 0, retry_after: float | None = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after  # seconds, from a 429/503 Retry-After header


class BackendAuthError(BackendError):
    """No usable login: never connected, logged out, or the refresh token was rejected."""


def normalize_base_url(raw: str) -> str:
    url = str(raw or '').strip().rstrip('/')
    if not url.startswith(('http://', 'https://')):
        raise BackendError('URL backend phải bắt đầu bằng http:// hoặc https://.')
    return url.removesuffix(API_PREFIX)


def configured_base_url() -> str:
    return normalize_base_url(os.environ.get(BACKEND_URL_ENV) or DEFAULT_BACKEND_URL)


def _error_message(body: dict, status: int) -> str:
    detail = body.get('detail') if isinstance(body, dict) else None
    if isinstance(detail, dict):
        detail = detail.get('message') or detail.get('error') or json.dumps(detail, ensure_ascii=False)
    elif isinstance(detail, list):  # FastAPI validation errors
        detail = '; '.join(str(d.get('msg', d)) for d in detail if isinstance(d, dict)) or None
    message = detail or (body.get('message') if isinstance(body, dict) else None)
    return str(message or f'HTTP {status}')[:300]


def _http(method: str, url: str, body: dict | None = None, token: str | None = None,
          timeout: float = TIMEOUT) -> dict:
    headers = {'accept': 'application/json'}
    data = None
    if body is not None:
        headers['content-type'] = 'application/json'
        data = json.dumps(body).encode()
    if token:
        headers['authorization'] = f'Bearer {token}'
    retry_after = None
    try:
        with urlopen(Request(url, data=data, headers=headers, method=method), timeout=timeout) as resp:
            status, raw = resp.status, resp.read()
    except HTTPError as exc:
        status, raw = exc.code, exc.read()
        header = (exc.headers or {}).get('Retry-After') or ''
        retry_after = float(header) if header.isdigit() else None
    except (URLError, TimeoutError, OSError) as exc:
        raise BackendError(f'Không kết nối được backend: {getattr(exc, "reason", exc)}') from exc
    try:
        payload = json.loads(raw) if raw else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = {}
    if status >= 400:
        raise BackendError(_error_message(payload, status), status, retry_after)
    return payload


class BackendClient:
    def __init__(self):
        self._lock = threading.Lock()
        self._session = self._load()
        self._calls: deque[float] = deque()  # monotonic time of each backend request, last 5 minutes

    def _count_call(self) -> None:
        now = time.monotonic()
        with self._lock:
            self._calls.append(now)
            while self._calls and self._calls[0] < now - 300:
                self._calls.popleft()

    def calls_last_5m(self) -> int:
        cutoff = time.monotonic() - 300
        with self._lock:
            return sum(1 for t in self._calls if t >= cutoff)

    # ---- session storage ------------------------------------------------

    @staticmethod
    def _load() -> dict:
        try:
            data = json.loads(BACKEND_SESSION_PATH.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {}
        if not isinstance(data, dict) or not data.get('refresh_token'):
            return {}
        try:
            # Tokens of another backend are useless once .env points elsewhere: log in again.
            return data if data.get('base_url') == configured_base_url() else {}
        except BackendError:
            return {}

    def _save(self, session: dict) -> None:
        self._session = session
        if not session:
            BACKEND_SESSION_PATH.unlink(missing_ok=True)
            return
        tmp = BACKEND_SESSION_PATH.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(session, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp.replace(BACKEND_SESSION_PATH)

    @property
    def connected(self) -> bool:
        return bool(self._session.get('access_token'))

    def info(self) -> dict:
        session = self._session
        user = session.get('user') or {}
        try:
            base_url = configured_base_url()
        except BackendError:
            base_url = os.environ.get(BACKEND_URL_ENV, '')
        # Only masked values leave this process: the page and its screenshots never show
        # the backend host or the admin email in full.
        return {'connected': self.connected, 'backend': mask_url(session.get('base_url') or base_url),
                'email': mask_email(user.get('email', '')), 'name': user.get('name', ''), 'role': user.get('role', '')}

    # ---- auth -----------------------------------------------------------

    def login(self, email: str, password: str) -> dict:
        try:
            base_url = configured_base_url()
        except BackendError as exc:
            raise BackendError(f'{BACKEND_URL_ENV} trong .env không hợp lệ: {exc}') from exc
        email = str(email or '').strip()
        if not email or not password:
            raise BackendError('Nhập email và mật khẩu.')
        try:
            data = _http('POST', base_url + API_PREFIX + '/auth/login', {'email': email, 'password': password})
        except BackendError as exc:
            if exc.status == 401:
                raise BackendError('Sai email hoặc mật khẩu.', 401) from exc
            raise
        user = data.get('user') or {}
        if user.get('role') not in ADMIN_ROLES:
            raise BackendError(f"Tài khoản {email} có quyền '{user.get('role')}'; cần tài khoản admin.", 403)
        with self._lock:
            self._save({'base_url': base_url, 'access_token': data['access_token'],
                        'refresh_token': data['refresh_token'],
                        'user': {k: user.get(k) for k in ('id', 'email', 'name', 'role')}})
        console_log('backend_login', '*', f'{mask_email(email)} @ {mask_url(base_url)}')
        return self.info()

    def logout(self) -> None:
        # Local only: the backend's /auth/logout revokes the account's refresh tokens on every device.
        with self._lock:
            self._save({})
        console_log('backend_logout', '*')

    def _refresh(self, stale_access: str) -> str:
        with self._lock:
            session = self._session
            if not session:
                raise BackendAuthError('Chưa đăng nhập backend.')
            if session.get('access_token') != stale_access:  # another thread already refreshed
                return session['access_token']
            try:
                data = _http('POST', session['base_url'] + API_PREFIX + '/auth/refresh',
                             {'refresh_token': session['refresh_token']})
            except BackendError as exc:
                if exc.status in (400, 401, 403):
                    self._save({})
                    raise BackendAuthError('Phiên đăng nhập backend đã hết hạn, hãy đăng nhập lại.', exc.status) from exc
                raise
            self._save({**session, 'access_token': data['access_token'], 'refresh_token': data['refresh_token']})
            return data['access_token']

    def get(self, path: str, params: dict | None = None, timeout: float = TIMEOUT):
        session = self._session
        if not session.get('access_token'):
            raise BackendAuthError('Chưa đăng nhập backend.')
        query = {k: v for k, v in (params or {}).items() if v not in (None, '')}
        url = session['base_url'] + API_PREFIX + path + (f'?{urlencode(query)}' if query else '')
        token = session['access_token']
        self._count_call()
        try:
            return _http('GET', url, token=token, timeout=timeout)
        except BackendError as exc:
            if exc.status != 401:
                raise
        token = self._refresh(token)
        self._count_call()
        return _http('GET', url, token=token, timeout=timeout)

    # ---- reads ------------------------------------------------------------

    def brands(self) -> list[dict]:
        return self.get('/brands')

    def board(self, day: str) -> dict:
        """Every live scheduled on `day` (YYYY-MM-DD) with its observed status."""
        return self.get('/live-monitor/board', {'date': day})

    def play_url(self, brand_id: str, session_id: str = '', timeout: float = TIMEOUT) -> dict:
        """Signed pull URL of the brand's session; an empty session_id means the brand's current one."""
        return self.get(f'/brands/{quote(brand_id, safe="")}/livestream/play_url', {'session_id': session_id},
                        timeout)
