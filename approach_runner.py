#!/usr/bin/env python3
"""Run an isolated feasibility check for one alternative playback approach."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from qc_probe import capture, resolve_shopee, resolve_tiktok

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / 'shops.json'
OUT = ROOT / 'approach_results'


def key(shop):
    import re
    name = shop.get('username') or shop.get('name') or str(shop.get('shop_id'))
    return f"{shop['platform'].lower()}_" + re.sub(r'[^a-zA-Z0-9_-]', '_', name)


def find_player():
    player = shutil.which('mpv') or shutil.which('mpvnet') or shutil.which('vlc')
    if player:
        return player
    local = Path.home() / 'AppData' / 'Local' / 'Programs' / 'mpv.net' / 'mpvnet.exe'
    return str(local) if local.is_file() else None


def report(method, shop, result):
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    folder = OUT / method / stamp
    folder.mkdir(parents=True, exist_ok=True)
    payload = {'method': method, 'shop_key': key(shop), 'shop': shop.get('username') or shop.get('name'),
               'platform': shop['platform'], 'checked_at': datetime.now(timezone.utc).isoformat(), **result}
    path = folder / 'report.json'
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({**payload, 'report': str(path.resolve())}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('method', choices=('browser', 'direct_stream', 'desktop_player'))
    parser.add_argument('shop_key')
    args = parser.parse_args()
    shops = json.loads(CONFIG.read_text(encoding='utf-8-sig')).get('shops', [])
    shop = next((s for s in shops if key(s) == args.shop_key), None)
    if not shop:
        raise SystemExit(f'Unknown shop key: {args.shop_key}')
    platform = shop['platform'].lower()
    timeout = 25

    if args.method == 'browser':
        if platform == 'tiktok':
            url = shop.get('live_url') or f"https://www.tiktok.com/@{shop['username']}/live"
            page_kind = 'tiktok_live_page'
        else:
            url = shop.get('live_url') or f"https://shopee.vn/shop/{shop['shop_id']}"
            page_kind = 'shopee_live_link' if shop.get('live_url') else 'shopee_shop_page_needs_manual_live_selection'
        opened = webbrowser.open(url, new=2)
        report('browser', shop, {'status': 'browser_opened' if opened else 'browser_launch_requested',
                                 'page_kind': page_kind, 'note': 'Check login, iframe restrictions, and whether the live player starts in the browser.'})
        return

    if args.method == 'desktop_player':
        player = find_player()
        if not player:
            report('desktop_player', shop, {'status': 'player_not_installed',
                                            'note': 'Install mpv or VLC, then rerun this method.'})
            return

    try:
        urls, detail = resolve_tiktok(shop, timeout) if platform == 'tiktok' else resolve_shopee(shop, timeout)
    except Exception as exc:
        report(args.method, shop, {'status': 'probe_inconclusive', 'error': str(exc)[:1000]})
        return
    if not urls:
        report(args.method, shop, {'status': 'probe_inconclusive', 'error': detail})
        return

    if args.method == 'direct_stream':
        cfg = json.loads(CONFIG.read_text(encoding='utf-8-sig'))
        folder = OUT / 'direct_stream' / datetime.now().strftime('%Y%m%d_%H%M%S') / key(shop)
        outcome = capture(urls[0], folder, int(cfg.get('capture_seconds', 10)), int(cfg.get('frame_interval_seconds', 2)), timeout)
        report('direct_stream', shop, {'status': 'captured' if outcome['ok'] else 'capture_failed',
                                       'stream_host': urlparse(urls[0]).hostname, 'capture': outcome,
                                       'evidence_dir': str(folder.resolve())})
        return

    name = Path(player).name.lower()
    if name == 'mpv.exe':
        command = [player, '--force-window=yes', '--title=Livestream QC PoC', urls[0]]
    elif name == 'vlc.exe':
        command = [player, '--play-and-exit', urls[0]]
    else:
        # mpv.net is the Windows GUI distribution of mpv and accepts a media URL.
        command = [player, urls[0]]
    try:
        proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        report('desktop_player', shop, {'status': 'player_launched', 'player': Path(player).name,
                                        'process_id': proc.pid, 'stream_host': urlparse(urls[0]).hostname})
    except OSError as exc:
        report('desktop_player', shop, {'status': 'player_launch_failed', 'error': str(exc)[:1000]})


if __name__ == '__main__':
    main()
