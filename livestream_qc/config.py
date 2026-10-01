"""Paths, settings, and shop identity helpers."""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Read KEY=VALUE lines from `.env` into os.environ; variables already set in the shell win."""
    try:
        lines = path.read_text(encoding='utf-8-sig').splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.removeprefix('export ').split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"\''))


_load_dotenv(ROOT / '.env')
CONFIG_PATH = ROOT / 'shops.json'
SHOPEE_COOKIES_PATH = ROOT / 'shopee_cookies.json'  # git-ignored; {user_id: Seller Center cookie}
BACKEND_SESSION_PATH = ROOT / 'backend_session.json'  # git-ignored; backend login tokens
WEB_DIR = ROOT / 'web'
RESULTS_DIR = ROOT / 'results'
APPROACH_RESULTS_DIR = ROOT / 'approach_results'
STREAMS_DIR = ROOT / 'streams'
MPV_CONFIGS_DIR = ROOT / 'mpv_configs'
MPV_CHECKS_DIR = ROOT / 'mpv_checks'

HOST = '127.0.0.1'
PORT = int(os.environ.get('QC_PORT', '8765'))
TIMEOUT = 25  # seconds allowed for resolving and reading a stream


def load_config(path: Path = CONFIG_PATH) -> dict:
    return json.loads(path.read_text(encoding='utf-8-sig'))


def load_shops(path: Path = CONFIG_PATH) -> list[dict]:
    return load_config(path).get('shops', [])


# Shopee brands pulled from the backend (shops connected through the Shopee Open API).
# backend_sync keeps them in memory; they are never written to shops.json.
_remote_shops: list[dict] = []


def set_remote_shops(shops: list[dict]) -> None:
    global _remote_shops
    _remote_shops = list(shops)


def all_shops() -> list[dict]:
    """Shops from shops.json followed by those synced from the backend."""
    return load_shops() + _remote_shops


def is_backend_shop(shop: dict) -> bool:
    return bool(shop.get('brand_id'))


def load_shopee_cookies() -> dict[str, str]:
    try:
        return json.loads(SHOPEE_COOKIES_PATH.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}


def shopee_cookie_for(shop: dict) -> str | None:
    """Seller Center cookie saved for this Shopee shop (keyed by user_id), read fresh on every call."""
    return load_shopee_cookies().get(str(shop.get('user_id'))) if shop.get('user_id') else None


def capture_settings(cfg: dict) -> tuple[int, int]:
    """Return (capture_seconds, frame_interval_seconds)."""
    return int(cfg.get('capture_seconds', 10)), int(cfg.get('frame_interval_seconds', 2))


def shop_platform(shop: dict) -> str:
    return shop['platform'].lower()


def shop_label(shop: dict) -> str:
    return shop.get('username') or shop.get('name') or str(shop.get('shop_id'))


def shop_key(shop: dict) -> str:
    """Stable, filesystem- and URL-safe identifier for a shop."""
    # Backend shops are keyed by a hash of brand_id: the key shows up in URLs, file names and logs.
    if is_backend_shop(shop):
        ident = 'api_' + hashlib.sha1(str(shop['brand_id']).encode()).hexdigest()[:10]
    else:
        ident = shop_label(shop)
    return f"{shop_platform(shop)}_{re.sub(r'[^a-zA-Z0-9_-]', '_', ident)}"


def find_shop(key: str, shops: list[dict] | None = None) -> dict | None:
    return next((s for s in (shops if shops is not None else all_shops()) if shop_key(s) == key), None)
