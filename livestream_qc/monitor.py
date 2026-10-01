"""Monitor shops continuously by keeping one mpv job per monitored shop running."""
from __future__ import annotations

import threading

from .config import all_shops, shop_key, shop_platform
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
        self._keys: set[str] | None = None  # None: every shop of the platforms; else only these shop keys
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._started: set[str] = set()

    @property
    def running(self) -> bool:
        with self._lock:
            return self._running

    @property
    def keys(self) -> list[str] | None:
        """Shop keys being monitored, or None when every shop is."""
        with self._lock:
            return sorted(self._keys) if self._running and self._keys is not None else None

    def start(self, platforms: set[str], keys: set[str] | None = None) -> None:
        """Start monitoring, or change what a running monitor watches (applied on its next pass)."""
        with self._lock:
            self._platforms = set(platforms)
            self._keys = set(keys) if keys is not None else None
            scope = f'{len(self._keys)} kênh đã chọn' if self._keys is not None else ','.join(sorted(platforms))
            if self._running:
                self._wake.set()
                console_log('monitor_updated', '*', scope)
                return
            self._running = True
            self._stop = threading.Event()
            self._started = set()
        console_log('monitor_started', '*', scope)
        threading.Thread(target=self._supervisor, args=(self._stop,), daemon=True).start()

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._stop.set()
            self._wake.set()
            keys, self._started = self._started, set()
        for key in keys:
            self.mpv.stop(key)
        console_log('monitor_stopped', '*')

    def _wanted(self) -> dict[str, dict]:
        with self._lock:
            platforms, keys = set(self._platforms), self._keys
        return {k: s for s in all_shops() if shop_platform(s) in platforms
                for k in [shop_key(s)] if keys is None or k in keys}

    def _supervisor(self, stop: threading.Event) -> None:
        """Start an mpv job for every monitored shop once; stop jobs of shops no longer monitored."""
        while not stop.is_set():
            try:
                shops = self._wanted()
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
            self._wake.wait(SYNC_SECONDS)
            self._wake.clear()
