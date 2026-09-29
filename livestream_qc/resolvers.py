"""Resolve a shop's current livestream into direct media URLs."""
from __future__ import annotations

import json
import sys
from urllib.parse import urlparse

from .config import shop_platform
from .utils import run, safe_error

Resolved = tuple[list[str] | None, str]

PLAYBACK_URL_FIELDS = {'playurl', 'play_url', 'streamurl', 'stream_url', 'm3u8_url'}


def tiktok_url(shop: dict) -> str:
    return f"https://www.tiktok.com/@{shop['username']}/live"


def shopee_candidates(shop: dict) -> list[str]:
    # shop_id/user_id identify the seller, not the current livestream session.
    # The correct session_id must first be discovered from the actual live page.
    session_id = shop.get('session_id')
    if not session_id:
        return []
    return [f"https://live.shopee.vn/api/v1/session/{int(session_id)}"]


def resolve_tiktok(shop: dict, timeout: int) -> Resolved:
    p = run([sys.executable, '-m', 'yt_dlp', '--no-warnings', '--get-url', tiktok_url(shop)], timeout)
    urls = [line.strip() for line in p.stdout.splitlines() if line.strip().startswith(('http://', 'https://'))]
    if p.returncode == 0 and urls:
        return urls, 'resolved'
    return None, safe_error(p.stderr or p.stdout or f'yt-dlp exited {p.returncode}')


def _playback_urls(value) -> list[str]:
    # Public API responses may include a nested playback URL. Match known field
    # names rather than searching arbitrary HTML for a media suffix.
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in PLAYBACK_URL_FIELDS and isinstance(child, str) and child.startswith('http'):
                found.append(child)
            found.extend(_playback_urls(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_playback_urls(child))
    return found


def resolve_shopee(shop: dict, timeout: int) -> Resolved:
    # This endpoint expects session_id, not shop_id or user_id. Discovery of an
    # active session is a separate step and is not guessed here.
    if not shop.get('session_id'):
        return None, 'missing_session_id: shop_id/user_id are seller identifiers; discover the active session_id from the live page first'
    failures = []
    for url in shopee_candidates(shop):
        p = run(['curl.exe', '-L', '-sS', '--max-time', str(timeout), '-A', 'Mozilla/5.0', url], timeout + 3)
        try:
            data = json.loads(p.stdout)
        except json.JSONDecodeError:
            data = {}
        urls = _playback_urls(data)
        if p.returncode == 0 and urls:
            return urls, 'media_url_found'
        failures.append(f'{urlparse(url).netloc}: session detail did not return a playback URL')
    return None, '; '.join(failures)


def resolve(shop: dict, timeout: int) -> Resolved:
    """Return (urls, detail); urls is None when the stream could not be resolved."""
    return resolve_tiktok(shop, timeout) if shop_platform(shop) == 'tiktok' else resolve_shopee(shop, timeout)
