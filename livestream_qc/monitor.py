"""Monitor all shops continuously by keeping one mpv job per shop running."""
from __future__ import annotations

import threading

from .config import load_shops, shop_key, shop_platform
from .mpv_retry import MpvRetryManager
from .utils import console_log

SYNC_SECONDS = 5  # how often the shop list is re-read to follow added/removed shops
START_STAGGER = 2  # seconds between mpv job starts so every shop does not resolve at once


class LiveMonitor:
    def __init__(self, mpv: MpvRetryManager):
        self.mpv = mpv
        self._lock = threading.RLock()
        self._running = False
        self._platforms: set[str] = set()
        self._stop = threading.Event()
        self._started: set[str] = set()

    @property
    def running(self) -> bool:
        with self._lock:
            return self._running

    def start(self, platforms: set[str]) -> None:
        with self._lock:
            self._platforms = set(platforms)
            if self._running:
                return
            self._running = True
            self._stop = threading.Event()
            self._started = set()
        console_log('monitor_started', '*', ','.join(sorted(platforms)))
        threading.Thread(target=self._supervisor, args=(self._stop,), daemon=True).start()

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._stop.set()
            keys, self._started = self._started, set()
        for key in keys:
            self.mpv.stop(key)
        console_log('monitor_stopped', '*')

    def _supervisor(self, stop: threading.Event) -> None:
        """Start an mpv job for every monitored shop once; stop jobs of shops that were removed."""
        while not stop.is_set():
            try:
                shops = {shop_key(s): s for s in load_shops() if shop_platform(s) in self._platforms}
            except (OSError, ValueError) as exc:
                console_log('monitor_config_error', '*', str(exc))
                shops = None
            if shops is not None:
                with self._lock:
                    removed = self._started - set(shops)
                    self._started -= removed
                for key in removed:
                    self.mpv.stop(key)
                for key, shop in shops.items():
                    with self._lock:
                        if stop.is_set() or key in self._started:
                            continue
                        self._started.add(key)
                    # A shop the user already started by hand keeps its running job.
                    if not self.mpv.active(key):
                        self.mpv.start(key, shop)
                        stop.wait(START_STAGGER)
            stop.wait(SYNC_SECONDS)
