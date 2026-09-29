"""Keep an mpv window open on a shop's live, retrying until real frames arrive."""
from __future__ import annotations

import subprocess
import threading
import time
from urllib.parse import urlparse

from .config import MPV_CHECKS_DIR, MPV_CONFIGS_DIR, TIMEOUT, shop_label, shop_platform
from .media import grab_frame
from .players import find_player, mpv_instance_args
from .resolvers import resolve
from .utils import console_log, safe_error, spawn, terminate

ACTIVE_STATES = {'retrying', 'checking_image', 'playing'}
IMAGE_CHECK_SECONDS = 20
# Seconds between failed resolves; Shopee is slower to avoid hammering its anti-bot gate.
RETRY_DELAY = {'shopee': 15}


class MpvRetryManager:
    def __init__(self):
        self._lock = threading.RLock()
        self._jobs: dict[str, dict] = {}

    def status(self, key: str) -> dict:
        with self._lock:
            job = self._jobs.get(key, {})
            if job.get('state') == 'playing' and (not job.get('proc') or job['proc'].poll() is not None):
                job.update(state='stopped', message='Cửa sổ mpv đã đóng.')
            return {'mpv_state': job.get('state', 'stopped'), 'mpv_attempts': job.get('attempts', 0),
                    'mpv_message': job.get('message')}

    def start(self, key: str, shop: dict) -> dict:
        with self._lock:
            job = self._jobs.get(key)
            if job and job['state'] in ACTIVE_STATES:
                return {'started': False, 'state': job['state'], 'message': job.get('message')}
            stop_event = threading.Event()
            self._jobs[key] = {'state': 'retrying', 'attempts': 0, 'message': 'Đang thử kết nối…',
                               'stop': stop_event, 'proc': None}
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
        console_log('mpv_stop_requested', key)

    def _update(self, key: str, stop_event: threading.Event, **fields) -> bool:
        """Update the job only if it still belongs to this worker; return whether it does."""
        with self._lock:
            job = self._jobs.get(key)
            if not job or job['stop'] is not stop_event:
                return False
            job.update(fields)
            return True

    def _next_attempt(self, key: str, stop_event: threading.Event) -> int | None:
        with self._lock:
            job = self._jobs.get(key)
            if not job or job['stop'] is not stop_event:
                return None
            job['attempts'] += 1
            attempt = job['attempts']
            job.update(state='retrying', message=f'Lần thử {attempt}: đang lấy stream…')
            return attempt

    def _wait_for_image(self, key: str, url: str, proc: subprocess.Popen, stop_event: threading.Event) -> bool:
        deadline = time.monotonic() + IMAGE_CHECK_SECONDS
        while time.monotonic() < deadline and not stop_event.is_set() and proc.poll() is None:
            time.sleep(1)
            size = grab_frame(url, MPV_CHECKS_DIR / key / 'latest.jpg')
            if size:
                console_log('image_detected', key, f'frame_bytes={size}')
                return True
        return False

    def _worker(self, key: str, shop: dict, stop_event: threading.Event) -> None:
        player = find_player(include_vlc=False)
        if not player:
            self._update(key, stop_event, state='error', message='Không tìm thấy mpv/mpv.net.')
            console_log('mpv_error', key, 'Không tìm thấy mpv/mpv.net')
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
                self._update(key, stop_event, message=f'Lần {attempt}: {detail[:220]}')
                stop_event.wait(RETRY_DELAY.get(shop_platform(shop), 5))
                continue

            url = urls[0]
            console_log('resolve_ok', key, f'lần={attempt} host={urlparse(url).hostname or "unknown"}')
            command = [player, *instance_args, '--force-window=yes', '--keep-open=no',
                       '--title=Livestream ' + shop_label(shop), url]
            try:
                proc = spawn(command)
            except OSError as exc:
                self._update(key, stop_event, state='error', message=f'Không chạy được mpv: {exc}')
                console_log('mpv_launch_failed', key, str(exc))
                return
            console_log('mpv_launched', key, f'pid={proc.pid}')
            if not self._update(key, stop_event, state='checking_image', proc=proc,
                                message=f'Lần {attempt}: mpv mở luồng, đang kiểm tra hình…'):
                terminate(proc)
                return

            if self._wait_for_image(key, url, proc, stop_event):
                self._update(key, stop_event, state='playing', message='Đã nhận được hình ảnh trong luồng mpv.')
                while not stop_event.wait(1) and proc.poll() is None:
                    pass
                terminate(proc)
                break

            terminate(proc)
            console_log('image_not_detected', key, f'lần={attempt}; mpv_exit={proc.poll()}')
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
            if not stop_event.is_set():
                stop_event.wait(3)

        self._update(key, stop_event, state='stopped', message='Đã dừng dò/kết nối mpv.', proc=None)
        console_log('mpv_retry_stopped', key)
