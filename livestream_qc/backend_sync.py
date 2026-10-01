"""Keep the backend's Shopee shops and today's live schedule in memory, and resolve their streams.

Every brand connected to the Shopee Open API becomes a monitored Shopee shop. Its
stream comes from the backend's `play_url` endpoint (get_session_detail, push key
stripped), for the session of the schedule on air now, else the brand's current one.

Every play_url call costs the backend one Shopee API call, so answers are cached per
brand and session: briefly while a schedule is on air, for minutes outside any
schedule, and failures back off instead of being retried at the mpv loop's pace.
"""
from __future__ import annotations

import threading
import time
from datetime import date, datetime, timedelta

from .backend_client import BackendAuthError, BackendClient, BackendError
from .config import set_remote_shops, shop_key
from .utils import console_log, mask_id, safe_error, utc_now

# ---- sync of brands and schedules -------------------------------------------
SYNC_TICK_SECONDS = 30
BRANDS_REFRESH_SECONDS = 600  # brands (and their Shopee connection) change rarely
BOARD_REFRESH_SECONDS = 120  # the board is read from the backend DB; its readings refresh every few minutes
SYNC_MAX_BACKOFF = 600

# ---- play_url cache, per brand and requested session --------------------------
LIVE_TTL = 60  # a live answer is reused this long (mpv reconnects), never past the URL's expiry
EXPIRY_MARGIN = 60
OFF_SCHEDULED_TTL = 60  # not live yet while a schedule is on air: the start is what we wait for
OFF_IDLE_TTL = 600  # not live and nothing scheduled now: lives outside the calendar are rare
ERROR_BACKOFF = (30, 60, 120, 300)  # seconds after the 1st, 2nd, 3rd, 4th+ consecutive failure

# A schedule counts as on air from a little before its start until a while after its planned end,
# since lives start late and overrun.
SCHEDULE_LEAD = timedelta(minutes=15)
SCHEDULE_GRACE = timedelta(minutes=30)
SKIPPED_SCHEDULE_STATUSES = {'cancelled', 'failed'}
SCHEDULE_FIELDS = ('schedule_id', 'platform', 'shop', 'account_id', 'session_id', 'scheduled_at', 'expected_end_at',
                   'duration_minutes', 'status', 'status_label', 'schedule_status', 'observed_status')

Resolved = tuple[list[str] | None, str]


def _parse_time(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone()
    except (TypeError, ValueError):
        return None


def _backoff(failures: int, retry_after: float | None = None) -> float:
    return retry_after or ERROR_BACKOFF[min(failures, len(ERROR_BACKOFF)) - 1]


class BackendSync:
    def __init__(self, client: BackendClient):
        self.client = client
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._shops: list[dict] = []
        self._schedules: dict[str, list[dict]] = {}
        self._sessions: dict[str, dict] = {}  # brand_id -> last play_url answer, URL removed
        self._status = {'synced_at': None, 'error': None, 'brands': 0, 'schedules': 0}
        self._brands_at = self._board_at = 0.0  # monotonic time of the last successful read
        self._board_day = ''
        self._sync_failures = 0
        self._sync_retry_at = 0.0
        self._sync_lock = threading.Lock()
        # play_url: brand_id -> {'key': session asked for, 'until': monotonic, 'result': Resolved, 'failures': n}
        self._play_cache: dict[str, dict] = {}
        self._brand_locks: dict[str, threading.Lock] = {}
        threading.Thread(target=self._loop, daemon=True).start()

    # ---- sync ---------------------------------------------------------------

    def sync_now(self) -> dict:
        """Read brands and schedules now (login, the Đồng bộ button), ignoring intervals and backoff."""
        self.sync(force=True)
        return self.status()

    def clear(self) -> None:
        set_remote_shops([])
        with self._lock:
            self._shops, self._schedules, self._sessions, self._play_cache = [], {}, {}, {}
            self._status = {'synced_at': None, 'error': None, 'brands': 0, 'schedules': 0}
            self._brands_at = self._board_at = 0.0
            self._sync_failures, self._sync_retry_at = 0, 0.0

    def _loop(self) -> None:
        while True:
            if self.client.connected and time.monotonic() >= self._sync_retry_at:
                self.sync()
            self._wake.wait(SYNC_TICK_SECONDS)
            self._wake.clear()

    def sync(self, force: bool = False) -> None:
        with self._sync_lock:
            now, today = time.monotonic(), date.today().isoformat()
            need_brands = force or not self._brands_at or now - self._brands_at >= BRANDS_REFRESH_SECONDS
            need_board = (force or not self._board_at or now - self._board_at >= BOARD_REFRESH_SECONDS
                          or self._board_day != today)
            if not (need_brands or need_board):
                return
            try:
                brands = self.client.brands() if need_brands else None
                board = self.client.board(today) if need_board else None
            except BackendAuthError as exc:
                self.clear()
                self._set_error(str(exc))
                return
            except (BackendError, KeyError, TypeError, ValueError) as exc:
                # Keep the last good lists: a backend hiccup must not stop the mpv jobs it feeds.
                self._sync_failures += 1
                delay = min(SYNC_MAX_BACKOFF, getattr(exc, 'retry_after', None) or 60 * 2 ** (self._sync_failures - 1))
                self._sync_retry_at = time.monotonic() + delay
                self._set_error(safe_error(str(exc)))
                console_log('backend_sync_failed', '*', f'{safe_error(str(exc))}; thử lại sau {int(delay)}s')
                return
            if not self.client.connected:  # logged out while this sync was in flight
                return
            self._sync_failures, self._sync_retry_at = 0, 0.0
            if brands is not None:
                self._shops = [{'platform': 'shopee', 'brand_id': str(b['id']), 'name': b.get('name') or str(b['id'])}
                               for b in brands if b.get('is_connect_shopee')]
                self._brands_at = now
                set_remote_shops(self._shops)
            with self._lock:
                if board is not None:
                    schedules: dict[str, list[dict]] = {}
                    for item in board.get('items') or []:
                        row = {field: item.get(field) for field in SCHEDULE_FIELDS}
                        schedules.setdefault(str(item.get('brand_id')), []).append(row)
                    for rows in schedules.values():
                        rows.sort(key=lambda r: r.get('scheduled_at') or '')
                    self._schedules, self._board_at, self._board_day = schedules, now, today
                self._status = {'synced_at': utc_now(), 'error': None, 'brands': len(self._shops),
                                'schedules': sum(len(r) for r in self._schedules.values())}
            console_log('backend_synced', '*', f"{'brands+' if brands is not None else ''}{'board' if board is not None else ''}: "
                                               f"{len(self._shops)} shop Shopee API, {self._status['schedules']} lịch hôm nay")

    def _set_error(self, message: str) -> None:
        with self._lock:
            self._status = {**self._status, 'error': message}

    # ---- reads --------------------------------------------------------------

    def status(self) -> dict:
        with self._lock:
            return {**self.client.info(), **self._status, 'api_calls_5m': self.client.calls_last_5m()}

    def schedules(self, brand_id: str) -> list[dict]:
        with self._lock:
            return list(self._schedules.get(brand_id, []))

    def session(self, brand_id: str) -> dict | None:
        with self._lock:
            return self._sessions.get(brand_id)

    def on_air_schedule(self, brand_id: str, now: datetime | None = None) -> dict | None:
        """The Shopee schedule of this brand that should be live now (latest start wins)."""
        now = now or datetime.now().astimezone()
        current = None
        for row in self.schedules(brand_id):
            start, end = _parse_time(row.get('scheduled_at')), _parse_time(row.get('expected_end_at'))
            if (row.get('platform') or 'shopee') != 'shopee' or row.get('schedule_status') in SKIPPED_SCHEDULE_STATUSES:
                continue
            if start and end and start - SCHEDULE_LEAD <= now <= end + SCHEDULE_GRACE:
                current = row
        return current

    # ---- stream -------------------------------------------------------------

    def resolve(self, shop: dict, timeout: int) -> Resolved:
        """Play URL of the brand's live, in the resolver contract: (urls or None, detail).

        One request per brand at a time; callers arriving meanwhile (monitor + a manual start)
        wait and take the cached answer. A new on-air schedule changes the session asked for,
        so it is never served from an older cached answer.
        """
        if not self.client.connected:
            return None, 'backend_not_connected: đăng nhập backend tại /login để lấy luồng shop Shopee API'
        brand_id = shop['brand_id']
        schedule = self.on_air_schedule(brand_id)
        session_id = str((schedule or {}).get('session_id') or '')
        with self._lock:
            lock = self._brand_locks.setdefault(brand_id, threading.Lock())
        with lock:
            with self._lock:
                cached = self._play_cache.get(brand_id)
            if cached and cached['key'] == session_id and time.monotonic() < cached['until']:
                urls, detail = cached['result']
                return urls, f'{detail} [cache, hỏi lại sau {int(cached["until"] - time.monotonic())}s]'
            failures = cached['failures'] if cached and cached['key'] == session_id else 0
            result, ttl, failed = self._fetch(shop, schedule, session_id, timeout, failures)
            with self._lock:
                self._play_cache[brand_id] = {'key': session_id, 'until': time.monotonic() + ttl, 'result': result,
                                              'failures': failures + 1 if failed else 0}
            return result

    def _fetch(self, shop: dict, schedule: dict | None, session_id: str, timeout: int,
               failures: int) -> tuple[Resolved, float, bool]:
        """Ask the backend once; return (result, seconds to reuse it, whether it was a failure)."""
        brand_id = shop['brand_id']
        where = 'theo lịch' if schedule else 'phiên hiện tại của shop'
        off_ttl = OFF_SCHEDULED_TTL if schedule else OFF_IDLE_TTL
        try:
            data = self.client.play_url(brand_id, session_id, timeout)
        except BackendAuthError as exc:
            return (None, f'backend_not_connected: {exc}'), 0, False
        except BackendError as exc:
            # 400: the brand has no API session yet (never created one, or only manual sessions).
            if exc.status == 400:
                return (None, f'not_live: shop chưa có phiên Shopee API ({exc})'), off_ttl, False
            delay = _backoff(failures + 1, exc.retry_after)
            console_log('backend_play_url_failed', shop_key(shop), f'{safe_error(str(exc))}; thử lại sau {int(delay)}s')
            return (None, f'backend_error: {safe_error(str(exc))}'), delay, True
        info = {k: data.get(k) for k in ('shopee_status', 'is_live', 'title', 'share_url', 'expires_at')}
        info['session_id'] = mask_id(data.get('session_id'))
        sid = info['session_id']
        with self._lock:
            self._sessions[brand_id] = {**info, 'source': where, 'schedule_id': (schedule or {}).get('schedule_id'),
                                        'checked_at': utc_now()}
        if not data.get('is_live'):
            return (None, f"not_live: phiên {sid} ({where}) "
                          f"shopee_status={data.get('shopee_status')}"), off_ttl, False
        if not data.get('play_url'):
            return (None, f"no_play_url: phiên {sid} đang live nhưng Shopee không trả play_url "
                          '(phiên tạo từ app điện thoại?)'), off_ttl, False
        console_log('backend_play_url', shop_key(shop), f"session={sid} {where}")
        ttl = LIVE_TTL
        expires = _parse_time(data.get('expires_at'))
        if expires:
            ttl = max(0.0, min(ttl, (expires - datetime.now().astimezone()).total_seconds() - EXPIRY_MARGIN))
        return ([data['play_url']], f"phiên {sid} qua backend ({data.get('title') or ''})"), ttl, False


_instance: BackendSync | None = None
_instance_lock = threading.Lock()


def get_sync() -> BackendSync:
    """The process-wide sync (started on first use, so CLI tools that never touch the backend skip it)."""
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = BackendSync(BackendClient())
        return _instance
