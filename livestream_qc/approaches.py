"""Isolated feasibility checks for alternative playback approaches.

Each run writes `approach_results/<method>/<timestamp>/report.json` so results
from different approaches never overwrite one another.
"""
from __future__ import annotations

import webbrowser
from pathlib import Path
from urllib.parse import urlparse

from .config import (APPROACH_RESULTS_DIR, TIMEOUT, capture_settings, load_config, shop_key, shop_label,
                     shop_platform, shopee_cookie_for)
from .media import capture
from .players import find_player, open_command
from .resolvers import SHOPEE_SHARE_URL, resolve, shopee_ongoing_session
from .utils import spawn, timestamp, utc_now, write_json

METHODS = ('browser', 'direct_stream', 'desktop_player')


def _browser(shop: dict, folder: Path, timeout: int) -> dict:
    if shop_platform(shop) == 'tiktok':
        url = shop.get('live_url') or f"https://www.tiktok.com/@{shop['username']}/live"
        page_kind = 'tiktok_live_page'
    elif shop.get('live_url'):
        url, page_kind = shop['live_url'], 'shopee_live_link'
    else:
        try:
            session_id, detail = shopee_ongoing_session(shop, timeout, shopee_cookie_for(shop))
        except OSError as exc:
            session_id, detail = None, str(exc)
        if session_id:
            url, page_kind = SHOPEE_SHARE_URL.format(session_id=session_id), 'shopee_share_page'
        elif shop.get('shop_id'):
            url, page_kind = f"https://shopee.vn/shop/{shop['shop_id']}", 'shopee_shop_page_no_ongoing_live'
        else:
            return {'status': 'probe_inconclusive', 'error': detail}
    opened = webbrowser.open(url, new=2)
    return {'status': 'browser_opened' if opened else 'browser_launch_requested', 'page_kind': page_kind,
            'note': 'Check login, iframe restrictions, and whether the live player starts in the browser.'}


def _resolve_first(shop: dict, timeout: int) -> tuple[str | None, dict | None]:
    """Return (stream_url, None) or (None, inconclusive_result)."""
    try:
        urls, detail = resolve(shop, timeout)
    except Exception as exc:
        return None, {'status': 'probe_inconclusive', 'error': str(exc)[:1000]}
    if not urls:
        return None, {'status': 'probe_inconclusive', 'error': detail}
    return urls[0], None


def _direct_stream(shop: dict, folder: Path, timeout: int) -> dict:
    url, failure = _resolve_first(shop, timeout)
    if failure:
        return failure
    seconds, interval = capture_settings(load_config())
    evidence = folder / shop_key(shop)
    outcome = capture(url, evidence, seconds, interval, timeout)
    return {'status': 'captured' if outcome['ok'] else 'capture_failed', 'stream_host': urlparse(url).hostname,
            'capture': outcome, 'evidence_dir': str(evidence.resolve())}


def _desktop_player(shop: dict, folder: Path, timeout: int) -> dict:
    player = find_player()
    if not player:
        return {'status': 'player_not_installed', 'note': 'Install mpv or VLC, then rerun this method.'}
    url, failure = _resolve_first(shop, timeout)
    if failure:
        return failure
    try:
        proc = spawn(open_command(player, url))
    except OSError as exc:
        return {'status': 'player_launch_failed', 'error': str(exc)[:1000]}
    return {'status': 'player_launched', 'player': Path(player).name, 'process_id': proc.pid,
            'stream_host': urlparse(url).hostname}


HANDLERS = {'browser': _browser, 'direct_stream': _direct_stream, 'desktop_player': _desktop_player}


def run_approach(method: str, shop: dict, timeout: int = TIMEOUT) -> dict:
    """Run one approach for one shop, persist its report, and return the payload."""
    folder = APPROACH_RESULTS_DIR / method / timestamp()
    folder.mkdir(parents=True, exist_ok=True)
    result = HANDLERS[method](shop, folder, timeout)
    payload = {'method': method, 'shop_key': shop_key(shop), 'shop': shop_label(shop),
               'platform': shop['platform'], 'checked_at': utc_now(), **result}
    report_path = folder / 'report.json'
    write_json(report_path, payload)
    return {**payload, 'report': str(report_path.resolve())}
