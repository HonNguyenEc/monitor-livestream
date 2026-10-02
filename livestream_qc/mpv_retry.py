"""Keep an mpv window open on a shop's live, retrying until real frames arrive and reopening after it ends.

The mpv job is also the source of truth for whether a shop is live: `live` means mpv is
playing a stream in which real frames were detected.
"""
from __future__ import annotations

import subprocess
import threading
import time
from urllib.parse import urlparse

from .config import MPV_CHECKS_DIR, MPV_CONFIGS_DIR, TIMEOUT, shop_label, shop_platform
from .mpv_ipc import frames_shown, ipc_path, screenshot
from .mpv_layout import MpvLayout
from .players import find_player, mpv_instance_args
from .resolvers import resolve
from .utils import console_log, safe_error, spawn, terminate, utc_now

ACTIVE_STATES = {'retrying', 'checking_image', 'playing'}
IMAGE_CHECK_SECONDS = 20
# While playing, mpv is asked this often whether new frames arrived; it also refreshes the dashboard thumbnail.
PLAYING_CHECK_SECONDS = 30
# Seconds between failed resolves; Shopee is slower to avoid hammering its anti-bot gate.
RETRY_DELAY = {'shopee': 15}
# Seconds between checks while the platform says the shop is not live.
OFFLINE_DELAY = {'tiktok': 20, 'shopee': 60}
# Failed attempts before a live shop is reported as no longer live, so one dropped
# connection or flaky resolve does not end the session.
LIVE_GRACE_ATTEMPTS = 2
# Resolver messages that mean the platform itself says the shop is not live.
OFFLINE_MARKERS = ('not currently live', 'not_live')


def classify_miss(detail: str) -> str:
    return 'offline' if any(m in detail.lower() for m in OFFLINE_MARKERS) else 'unknown'


class MpvRetryManager:
    def __init__(self):
        self._lock = threading.RLock()
        self._jobs: dict[str, dict] = {}
        self.layout = MpvLayout()  # the parent window every shop's mpv is embedded in

    def status(self, key: str) -> dict:
        with self._lock:
            job = self._jobs.get(key, {})
            active = job.get('state') in ACTIVE_STATES
            status = job.get('verdict') if active else None
            frame = MPV_CHECKS_DIR / key / 'latest.jpg'
            return {'mpv_state': job.get('state', 'stopped'), 'mpv_attempts': job.get('attempts', 0),
                    'mpv_message': job.get('message'),
                    'status': status or ('checking' if active else 'not_checked'),
                    'checked_at': job.get('checked_at') if active else None,
                    'live_since': job.get('live_since') if status == 'live' else None,
                    'frame': f'/api/mpv/frame/{key}?t={int(frame.stat().st_mtime)}' if frame.is_file() else None}

    def active(self, key: str) -> bool:
        with self._lock:
            return self._jobs.get(key, {}).get('state') in ACTIVE_STATES

    def start(self, key: str, shop: dict) -> dict:
        with self._lock:
            job = self._jobs.get(key)
            if job and job['state'] in ACTIVE_STATES:
                return {'started': False, 'state': job['state'], 'message': job.get('message')}
            stop_event = threading.Event()
            self._jobs[key] = {'state': 'retrying', 'attempts': 0, 'message': 'Đang thử kết nối…',
                               'stop': stop_event, 'proc': None}
        self.layout.join(key, shop_label(shop))
        console_log('mpv_retry_started', key, shop_label(shop))
        threading.Thread(target=self._worker, args=(key, shop, stop_event), daemon=True).start()
        return {'started': True, 'state': 'retrying'}

    def stop(self, key: str) -> None:
        proc = None
        with self._lock:
            job = self._jobs.get(key)
            if job:
                job['stop'].set()
                proc = job.get('proc')
                job.update(state='stopping', message='Đang dừng…')
        terminate(proc)
        self.layout.leave(key)
        console_log('mpv_stop_requested', key)

    def _update(self, key: str, stop_event: threading.Event, **fields) -> bool:
        """Update the job only if it still belongs to this worker; return whether it does."""
        with self._lock:
            job = self._jobs.get(key)
            if not job or job['stop'] is not stop_event:
                return False
            job.update(fields)
            return True

    def _verdict(self, key: str, stop_event: threading.Event, verdict: str) -> None:
        """Record the outcome of one attempt; a live shop needs repeated misses to stop being live."""
        with self._lock:
            job = self._jobs.get(key)
            if not job or job['stop'] is not stop_event:
                return
            previous = job.get('verdict')
            job['checked_at'] = utc_now()
            if verdict == 'live':
                job['misses'] = 0
                if previous != 'live':
                    job['live_since'] = utc_now()
            else:
                job['misses'] = job.get('misses', 0) + 1
                if previous == 'live' and job['misses'] < LIVE_GRACE_ATTEMPTS:
                    verdict = 'live'
            job['verdict'] = verdict
        self.layout.set_live(key, verdict == 'live')  # live shops are tiled first
        if previous != verdict:
            console_log('live_state', key, f'{previous or "-"} -> {verdict}')

    def _release(self, key: str, stop_event: threading.Event) -> None:
        """Give up the tile of a job that ended on its own, unless a newer job owns the key."""
        with self._lock:
            job = self._jobs.get(key)
            if not job or job['stop'] is not stop_event:
                return
        self.layout.leave(key)

    def _next_attempt(self, key: str, stop_event: threading.Event) -> int | None:
        with self._lock:
            job = self._jobs.get(key)
            if not job or job['stop'] is not stop_event:
                return None
            job['attempts'] += 1
            attempt = job['attempts']
            job.update(state='retrying', message=f'Lần thử {attempt}: đang lấy stream…')
            return attempt

    def _wait_for_image(self, key: str, proc: subprocess.Popen, stop_event: threading.Event) -> bool:
        """Ask mpv itself whether it has shown a video frame; no second connection to the stream."""
        deadline = time.monotonic() + IMAGE_CHECK_SECONDS
        while time.monotonic() < deadline and not stop_event.wait(1) and proc.poll() is None:
            frames = frames_shown(ipc_path(key))
            if frames:
                screenshot(ipc_path(key), MPV_CHECKS_DIR / key / 'latest.jpg')
                console_log('image_detected', key, f'frames={frames}')
                return True
        return False

    def _watch_playing(self, key: str, proc: subprocess.Popen, stop_event: threading.Event) -> None:
        """Return when mpv exits, is stopped, or stops receiving new frames."""
        last = frames_shown(ipc_path(key))
        while not stop_event.wait(PLAYING_CHECK_SECONDS) and proc.poll() is None:
            frames = frames_shown(ipc_path(key))
            if frames <= last:
                console_log('image_stalled', key, f'frames={frames}')
                return
            last = frames
            screenshot(ipc_path(key), MPV_CHECKS_DIR / key / 'latest.jpg')

    def _worker(self, key: str, shop: dict, stop_event: threading.Event) -> None:
        player = find_player(include_vlc=False)
        if not player:
            self._update(key, stop_event, state='error', message='Không tìm thấy mpv/mpv.net.')
            console_log('mpv_error', key, 'Không tìm thấy mpv/mpv.net')
            self._release(key, stop_event)
            return
        instance_args = mpv_instance_args(player, MPV_CONFIGS_DIR / key)

        while not stop_event.is_set():
            attempt = self._next_attempt(key, stop_event)
            if attempt is None:
                return
            console_log('resolve_start', key, f'lần={attempt}')
            try:
                urls, detail = resolve(shop, TIMEOUT)
            except Exception as exc:
                urls, detail = None, str(exc)[:300]
            if stop_event.is_set():
                break
            if not urls:
                console_log('resolve_failed', key, safe_error(detail))
                verdict = classify_miss(detail)
                self._verdict(key, stop_event, verdict)
                message = 'Kênh không live, sẽ tự mở mpv khi kênh lên live.' if verdict == 'offline' else detail[:220]
                self._update(key, stop_event, message=f'Lần {attempt}: {message}')
                delays = OFFLINE_DELAY if verdict == 'offline' else RETRY_DELAY
                stop_event.wait(delays.get(shop_platform(shop), 5))
                continue

            url = urls[0]
            console_log('resolve_ok', key, f'lần={attempt} host={urlparse(url).hostname or "unknown"}')
            command = [player, *instance_args, *self.layout.mpv_args(key, player), '--input-ipc-server=' + ipc_path(key),
                       '--force-window=yes', '--keep-open=no', '--title=Livestream ' + shop_label(shop), url]
            try:
                proc = spawn(command)
            except OSError as exc:
                self._update(key, stop_event, state='error', message=f'Không chạy được mpv: {exc}')
                console_log('mpv_launch_failed', key, str(exc))
                self._release(key, stop_event)
                return
            console_log('mpv_launched', key, f'pid={proc.pid}')
            if not self._update(key, stop_event, state='checking_image', proc=proc,
                                message=f'Lần {attempt}: mpv mở luồng, đang kiểm tra hình…'):
                terminate(proc)
                return

            if self._wait_for_image(key, proc, stop_event):
                self._verdict(key, stop_event, 'live')
                self._update(key, stop_event, state='playing', message='mpv đang phát, đã nhận được hình ảnh.')
                self._watch_playing(key, proc, stop_event)
                terminate(proc)
                if stop_event.is_set():
                    break
                try:  # the next window reuses this shop's IPC pipe name
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                # The window closed, the stream ended or froze: go back to checking so the next live is caught.
                console_log('mpv_exited', key, f'exit={proc.poll()}')
                self._update(key, stop_event, proc=None, message='Cửa sổ mpv đã đóng, đang kiểm tra lại…')
                continue

            terminate(proc)
            self._verdict(key, stop_event, 'no_signal')
            console_log('image_not_detected', key, f'lần={attempt}; mpv_exit={proc.poll()}')
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
            if not stop_event.is_set():
                stop_event.wait(3)

        self._update(key, stop_event, state='stopped', message='Đã dừng dò/kết nối mpv.', proc=None)
        console_log('mpv_retry_stopped', key)
