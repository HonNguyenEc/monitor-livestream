"""Resolve a shop's current livestream into direct media URLs."""
from __future__ import annotations

import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

from .config import is_backend_shop, shop_key, shop_platform, shopee_cookie_for
from .utils import console_log, run, safe_error

Resolved = tuple[list[str] | None, str]

# TikTok web API behind the /live page; returns room status and pull URLs without page scraping.
TIKTOK_ROOM_API = 'https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId={username}'
TIKTOK_HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'referer': 'https://www.tiktok.com/',
    'user-agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'),
}
TIKTOK_LIVE = 2  # room status: 2 live, 4 ended
TIKTOK_QUALITIES = ('origin', 'uhd', 'hd', 'sd', 'ld')  # best first; 'ao' is audio only

# Public buyer API, used only to find the ongoing session (ported from
# ihmily/DouyinLiveRecorder: iOS app user agent, share page as referer).
SHOPEE_API = 'https://live.shopee.vn'
SHOPEE_SHARE_URL = SHOPEE_API + '/share?from=live&session={session_id}'
SHOPEE_HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'user-agent': 'ios/7.830 (ios 17.0; ; iPhone 15 (A2846/A3089/A3090/A3092))',
}

# Seller Center APIs. Unlike live.shopee.vn's session API they need no page
# signature, only the shop's Seller Center login cookie (SPC_SC_SESSION).
SELLER_CENTER = 'https://banhang.shopee.vn'
SELLER_CENTER_LOGIN = SELLER_CENTER + '/api/v2/login/'
SELLER_CENTER_SESSION_INFO = SELLER_CENTER + '/api/supply/lm/sellercenter/realtime/dashboard/sessionInfo?sessionId={session_id}'
SELLER_CENTER_HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'referer': SELLER_CENTER + '/',
    'user-agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'),
}


def tiktok_url(shop: dict) -> str:
    return f"https://www.tiktok.com/@{shop['username']}/live"


def resolve_tiktok_ytdlp(shop: dict, timeout: int) -> Resolved:
    p = run([sys.executable, '-m', 'yt_dlp', '--no-warnings', '--get-url', tiktok_url(shop)], timeout)
    console_log('yt_dlp_response', shop_key(shop), f'exit={p.returncode} stdout={safe_error(p.stdout)!r} '
                                                   f'stderr={safe_error(p.stderr)!r}')
    urls = [line.strip() for line in p.stdout.splitlines() if line.strip().startswith(('http://', 'https://'))]
    if p.returncode == 0 and urls:
        return urls, 'resolved'
    return None, safe_error(p.stderr or p.stdout or f'yt-dlp exited {p.returncode}')


def resolve_tiktok(shop: dict, timeout: int) -> Resolved:
    """Live status and pull URLs straight from TikTok's room API.

    yt-dlp must scrape the profile page for the room id, which TikTok now only serves to
    browser-impersonating clients; without curl_cffi it wrongly reports live shops as not live.
    It remains the fallback when the API itself fails.
    """
    try:
        status, data = _get_json(TIKTOK_ROOM_API.format(username=quote(shop['username'])), TIKTOK_HEADERS, timeout)
    except (URLError, TimeoutError, OSError) as exc:
        console_log('tiktok_api_failed', shop_key(shop), safe_error(str(exc)))
        return resolve_tiktok_ytdlp(shop, timeout)
    room = (data.get('data') or {}).get('liveRoom') or {}
    if status != 200 or data.get('statusCode') != 0 or 'status' not in room:
        console_log('tiktok_api_failed', shop_key(shop), f"http {status} statusCode {data.get('statusCode')}")
        return resolve_tiktok_ytdlp(shop, timeout)
    if room['status'] != TIKTOK_LIVE:
        return None, f"not_live: TikTok room status={room['status']}"
    try:
        qualities = json.loads(room['streamData']['pull_data']['stream_data'])['data']
    except (KeyError, TypeError, json.JSONDecodeError):
        qualities = {}
    for quality in TIKTOK_QUALITIES:
        main = (qualities.get(quality) or {}).get('main') or {}
        urls = [main[kind] for kind in ('flv', 'hls') if main.get(kind)]
        if urls:
            return urls, f"TikTok room API ({quality}) {room.get('title') or ''}".strip()
    return None, 'no_play_url: TikTok room is live but returned no stream URL'


def _get_json(url: str, headers: dict, timeout: int, cookie: str | None = None) -> tuple[int, dict]:
    """GET `url`; return (http_status, json_body or {})."""
    headers = {**headers, 'Cookie': cookie} if cookie else headers
    try:
        with urlopen(Request(url, headers=headers), timeout=timeout) as resp:
            status, body = resp.status, resp.read()
    except HTTPError as exc:
        status, body = exc.code, exc.read()
    parsed = urlparse(url)
    console_log('http_response', parsed.path + (f'?{parsed.query}' if parsed.query else ''),
                f"status={status} body={safe_error(body.decode('utf-8', 'replace'))}")
    try:
        return status, json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return status, {}


def seller_center_account(cookie: str, timeout: int) -> dict | None:
    """Identify the shop behind a Seller Center cookie: {user_id, shop_id, username}, or None if rejected."""
    status, data = _get_json(SELLER_CENTER_LOGIN, SELLER_CENTER_HEADERS, timeout, cookie)
    if status != 200 or not str(data.get('id') or '').isdigit():
        return None
    shop_id = str(data.get('shopid') or '')
    return {'user_id': int(data['id']), 'shop_id': int(shop_id) if shop_id.isdigit() else None,
            'username': data.get('username') or ''}


def _session_from_link(url: str, timeout: int) -> int | None:
    """Session id from a share link (live.shopee.vn/share?session=...) or an shp.ee short link."""
    if 'live.shopee' not in url:
        with urlopen(Request(url, headers=SHOPEE_HEADERS), timeout=timeout) as resp:  # follow shp.ee redirect
            url = resp.geturl()
    session = parse_qs(urlparse(url).query).get('session', [''])[0]
    return int(session) if session.isdigit() else None


def shopee_ongoing_session(shop: dict, timeout: int, cookie: str | None = None) -> tuple[int | None, str]:
    """Session to watch: share link in live_url, else the seller's ongoing live (user_id from config or cookie)."""
    if shop.get('live_url'):
        session_id = _session_from_link(shop['live_url'], timeout)
        if session_id:
            return session_id, 'live_url'
    uid = shop.get('user_id')
    if not uid and cookie:
        uid = (seller_center_account(cookie, timeout) or {}).get('user_id')
    if not uid:
        return None, 'missing_user_id: save the shop again with its Seller Center cookie'
    referer = SHOPEE_SHARE_URL.format(session_id='') + '&share_user_id='
    status, data = _get_json(f'{SHOPEE_API}/api/v1/shop_page/live/ongoing?uid={int(uid)}',
                             {**SHOPEE_HEADERS, 'referer': referer}, timeout)
    ongoing = (data.get('data') or {}).get('ongoing_live')
    if ongoing and ongoing.get('session_id'):
        return int(ongoing['session_id']), ongoing.get('title') or ''
    if status == 200 and data.get('err_code') == 0:
        return None, 'not_live: seller has no ongoing Shopee Live session'
    return None, f"ongoing_lookup_failed: http {status} err {data.get('err_code', data.get('error'))}"


def resolve_shopee(shop: dict, timeout: int) -> Resolved:
    cookie = shopee_cookie_for(shop)
    if not cookie:
        return None, "missing_cookie: add the shop's Seller Center cookie (SPC_SC_SESSION) in its config"
    try:
        session_id, detail = shopee_ongoing_session(shop, timeout, cookie)
        if not session_id:
            return None, detail
        status, data = _get_json(SELLER_CENTER_SESSION_INFO.format(session_id=session_id),
                                 SELLER_CENTER_HEADERS, timeout, cookie)
    except (URLError, TimeoutError, OSError) as exc:
        return None, safe_error(f'shopee_request_failed: {exc}')
    if status != 200 or data.get('code') not in (0, None):
        message = data.get('msg') or data.get('message') or ''
        return None, f'seller_center_auth_failed: http {status} {message}; Seller Center login expired?'
    info = data.get('data') or {}
    if not info:
        return None, f'seller_center_no_access: session {session_id} belongs to a shop this login does not manage'
    if info.get('sessionStatus') != 1:
        return None, f"not_live: session {session_id} sessionStatus={info.get('sessionStatus')}"
    url = info.get('sessionStreamingUrl')
    if url:
        return [url], f"session {session_id} via Seller Center ({info.get('sessionTitle') or ''})"
    return None, f'no_play_url: Seller Center returned no sessionStreamingUrl for session {session_id}'


def resolve(shop: dict, timeout: int) -> Resolved:
    """Return (urls, detail); urls is None when the stream could not be resolved."""
    if shop_platform(shop) == 'tiktok':
        return resolve_tiktok(shop, timeout)
    if is_backend_shop(shop):  # Shopee Open API shop: play_url through the backend, no cookie needed
        from .backend_sync import get_sync
        return get_sync().resolve(shop, timeout)
    return resolve_shopee(shop, timeout)
