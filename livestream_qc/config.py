"""Paths, settings, and shop identity helpers."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / 'shops.json'
WEB_DIR = ROOT / 'web'
RESULTS_DIR = ROOT / 'results'
APPROACH_RESULTS_DIR = ROOT / 'approach_results'
STREAMS_DIR = ROOT / 'streams'
MPV_CONFIGS_DIR = ROOT / 'mpv_configs'
MPV_CHECKS_DIR = ROOT / 'mpv_checks'

HOST = '127.0.0.1'
PORT = 8765
TIMEOUT = 25  # seconds allowed for resolving and reading a stream


def load_config(path: Path = CONFIG_PATH) -> dict:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def load_shops(path: Path = CONFIG_PATH) -> list[dict]:
    return load_config(path).get('shops', [])


def capture_settings(cfg: dict) -> tuple[int, int]:
    """Return (capture_seconds, frame_interval_seconds)."""
    return int(cfg.get('capture_seconds', 10)), int(cfg.get('frame_interval_seconds', 2))


def shop_platform(shop: dict) -> str:
    return shop['platform'].lower()


def shop_label(shop: dict) -> str:
    return shop.get('username') or shop.get('name') or str(shop.get('shop_id'))


def shop_key(shop: dict) -> str:
    """Stable, filesystem- and URL-safe identifier for a shop."""
    return f"{shop_platform(shop)}_{re.sub(r'[^a-zA-Z0-9_-]', '_', shop_label(shop))}"


def find_shop(key: str, shops: list[dict] | None = None) -> dict | None:
    return next((s for s in (shops if shops is not None else load_shops()) if shop_key(s) == key), None)
