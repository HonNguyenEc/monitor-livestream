"""Validated edits to shops.json and per-shop Shopee cookies from the dashboard."""
from __future__ import annotations

import json
import re
import threading

from .config import CONFIG_PATH, SHOPEE_COOKIES_PATH, TIMEOUT, load_config, load_shopee_cookies, shop_key

_write_lock = threading.Lock()

# Allowed fields per platform: name -> (type, required). A Shopee shop is identified
# by its Seller Center cookie; name/user_id/shop_id are filled in from that login.
FIELDS = {
    'tiktok': {'username': (str, True), 'live_url': (str, False)},
    'shopee': {'name': (str, False), 'user_id': (int, False), 'shop_id': (int, False), 'live_url': (str, False)},
}
SELLER_CENTER_COOKIE = 'SPC_SC_SESSION'


class ShopError(ValueError):
    pass


def validate_shop(data: dict) -> dict:
    """Return a clean shop dict or raise ShopError with a user-facing message."""
    platform = str(data.get('platform', '')).strip().lower()
    if platform not in FIELDS:
        raise ShopError('Nền tảng phải là tiktok hoặc shopee.')
    shop = {'platform': platform}
    for field, (kind, required) in FIELDS[platform].items():
        raw = data.get(field)
        value = str(raw).strip() if raw is not None else ''
        if not value:
            if required:
                raise ShopError(f'Thiếu trường bắt buộc: {field}.')
            continue
        if kind is int:
            if not value.isdigit():
                raise ShopError(f'{field} phải là số nguyên dương.')
            shop[field] = int(value)
        else:
            shop[field] = value
    if platform == 'tiktok':
        shop['username'] = shop['username'].lstrip('@')
    if 'live_url' in shop and not shop['live_url'].startswith(('http://', 'https://')):
        raise ShopError('live_url phải bắt đầu bằng http:// hoặc https://.')
    return shop


def extract_seller_cookie(raw: str) -> str:
    """Keep only SPC_SC_SESSION from a pasted cookie header (all the stream API needs)."""
    match = re.search(rf'(?:^|[;\s]){SELLER_CENTER_COOKIE}=([^;\s]+)', raw.strip().removeprefix('cookie:'))
    if not match:
        raise ShopError(f'Cookie phải có {SELLER_CENTER_COOKIE}: copy header "cookie" của một request tới banhang.shopee.vn.')
    return f'{SELLER_CENTER_COOKIE}={match.group(1)}'


def _apply_seller_account(shop: dict, cookie: str) -> None:
    """Verify the cookie with Seller Center and fill in the shop's identity from it."""
    from .resolvers import seller_center_account

    try:
        account = seller_center_account(cookie, TIMEOUT)
    except OSError as exc:
        raise ShopError(f'Không kết nối được Seller Center: {exc}') from exc
    if not account:
        raise ShopError('Seller Center từ chối cookie (hết hạn hoặc sai). Hãy đăng nhập lại và copy cookie mới.')
    if shop.get('user_id') and shop['user_id'] != account['user_id']:
        raise ShopError(f"Cookie thuộc tài khoản {account['username']} (user_id {account['user_id']}), "
                        f"không khớp user_id {shop['user_id']} đã nhập.")
    shop['user_id'] = account['user_id']
    if account['shop_id']:
        shop['shop_id'] = account['shop_id']
    shop.setdefault('name', account['username'] or str(account['user_id']))


def _write_config(cfg: dict) -> None:
    tmp = CONFIG_PATH.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
    tmp.replace(CONFIG_PATH)


def _write_cookies(cookies: dict[str, str]) -> None:
    tmp = SHOPEE_COOKIES_PATH.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(cookies, indent=2) + '\n', encoding='utf-8')
    tmp.replace(SHOPEE_COOKIES_PATH)


def save_shop(data: dict, original_key: str | None = None) -> dict:
    """Create a shop, or replace the one at `original_key`. Returns the saved shop."""
    shop = validate_shop(data)
    existing = next((s for s in load_config().get('shops', []) if shop_key(s) == original_key), None) \
        if original_key else None
    cookie = None
    if shop['platform'] == 'shopee':
        raw_cookie = str(data.get('cookie') or '').strip()
        if raw_cookie:
            cookie = extract_seller_cookie(raw_cookie)
            _apply_seller_account(shop, cookie)  # network call, done before taking the write lock
        else:
            old_uid = (existing or {}).get('user_id')
            if not old_uid or str(old_uid) not in load_shopee_cookies():
                raise ShopError('Thiếu cookie Seller Center của shop.')
            if shop.get('user_id', old_uid) != old_uid:
                raise ShopError('Đổi user_id cần dán cookie Seller Center mới của shop đó.')
            shop['user_id'] = old_uid
            shop.setdefault('name', existing.get('name') or str(old_uid))

    new_key = shop_key(shop)
    with _write_lock:
        cfg = load_config()
        shops = cfg.setdefault('shops', [])
        index = next((i for i, s in enumerate(shops) if shop_key(s) == original_key), None) if original_key else None
        if original_key and index is None:
            raise ShopError('Không tìm thấy shop cần sửa.')
        if any(shop_key(s) == new_key for i, s in enumerate(shops) if i != index):
            raise ShopError(f'Shop {new_key} đã tồn tại.')
        if index is None:
            shops.append(shop)
        else:
            shops[index] = shop
        _write_config(cfg)
        if cookie:
            cookies = load_shopee_cookies()
            old_uid = (existing or {}).get('user_id')
            if old_uid and old_uid != shop['user_id']:
                cookies.pop(str(old_uid), None)
            cookies[str(shop['user_id'])] = cookie
            _write_cookies(cookies)
    return {**shop, 'key': new_key}


def delete_shop(key: str) -> None:
    with _write_lock:
        cfg = load_config()
        shops = cfg.get('shops', [])
        removed = [s for s in shops if shop_key(s) == key]
        if not removed:
            raise ShopError('Không tìm thấy shop cần xoá.')
        cfg['shops'] = [s for s in shops if shop_key(s) != key]
        _write_config(cfg)
        uid = str(removed[0].get('user_id') or '')
        cookies = load_shopee_cookies()
        still_used = any(str(s.get('user_id')) == uid for s in cfg['shops'])
        if uid in cookies and not still_used:
            cookies.pop(uid)
            _write_cookies(cookies)
