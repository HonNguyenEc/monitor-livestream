#!/usr/bin/env python3
"""Quick direct-stream feasibility probe for TikTok and Shopee Live."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


def run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)


def safe_error(text: str) -> str:
    # Avoid persisting signed stream URLs, cookies, or tokens in result logs.
    text = re.sub(r'https?://\S+', '[url]', text)
    text = re.sub(r'(?i)(cookie|token|authorization|signature)([=: ]+)\S+', r'\1\2[redacted]', text)
    return text.strip()[-1200:]


def tiktok_url(shop: dict) -> str:
    return f"https://www.tiktok.com/@{shop['username']}/live"


def shopee_candidates(shop: dict) -> list[str]:
    # shop_id/user_id identify the seller, not the current livestream session.
    # The correct session_id must first be discovered from the actual live page.
    session_id = shop.get('session_id')
    if not session_id:
        return []
    return [f"https://live.shopee.vn/api/v1/session/{int(session_id)}"]


def resolve_tiktok(shop: dict, timeout: int) -> tuple[list[str] | None, str]:
    cmd = [sys.executable, '-m', 'yt_dlp', '--no-warnings', '--get-url', tiktok_url(shop)]
    p = run(cmd, timeout)
    urls = [line.strip() for line in p.stdout.splitlines() if line.strip().startswith(('http://', 'https://'))]
    if p.returncode == 0 and urls:
        return urls, 'resolved'
    return None, safe_error(p.stderr or p.stdout or f'yt-dlp exited {p.returncode}')


def resolve_shopee(shop: dict, timeout: int) -> tuple[list[str] | None, str]:
    # This endpoint expects session_id, not shop_id or user_id. Discovery of an
    # active session is a separate step and is not guessed here.
    failures = []
    for url in shopee_candidates(shop):
        p = run(['curl.exe', '-L', '-sS', '--max-time', str(timeout), '-A', 'Mozilla/5.0', url], timeout + 3)
        try:
            data = json.loads(p.stdout)
        except json.JSONDecodeError:
            data = {}
        # Public API responses may include a nested playback URL. Match known field
        # names rather than searching arbitrary HTML for a media suffix.
        urls = []
        def visit(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key.lower() in {'playurl', 'play_url', 'streamurl', 'stream_url', 'm3u8_url'} and isinstance(child, str) and child.startswith('http'):
                        urls.append(child)
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)
        visit(data)
        if p.returncode == 0 and urls:
            return urls, 'media_url_found'
        failures.append(f'{urlparse(url).netloc}: session detail did not return a playback URL')
    if not shop.get('session_id'):
        return None, 'missing_session_id: shop_id/user_id are seller identifiers; discover the active session_id from the live page first'
    return None, '; '.join(failures)


def capture(url: str, out_dir: Path, seconds: int, interval: int, timeout: int) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(out_dir / 'frame_%02d.jpg')
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-rw_timeout', str(timeout * 1_000_000),
           '-i', url, '-t', str(seconds), '-vf', f'fps=1/{interval}', '-q:v', '3', pattern]
    started = time.monotonic()
    try:
        p = run(cmd, seconds + timeout,)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': 'ffmpeg_timeout', 'duration_seconds': round(time.monotonic() - started, 2)}
    frames = sorted(out_dir.glob('frame_*.jpg'))
    return {'ok': p.returncode == 0 and bool(frames), 'frame_count': len(frames),
            'duration_seconds': round(time.monotonic() - started, 2),
            'error': None if p.returncode == 0 and frames else safe_error(p.stderr or f'ffmpeg exited {p.returncode}')}


def main() -> int:
    ap = argparse.ArgumentParser(description='Probe direct livestream playback and capture a few frames.')
    ap.add_argument('--config', type=Path, default=Path('shops.json'))
    ap.add_argument('--seconds', type=int)
    ap.add_argument('--timeout', type=int, default=25)
    args = ap.parse_args()
    cfg = json.loads(args.config.read_text(encoding='utf-8-sig'))
    seconds = args.seconds or int(cfg.get('capture_seconds', 10))
    interval = int(cfg.get('frame_interval_seconds', 2))
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg not found on PATH')
    results_dir = Path('results') / datetime.now().strftime('%Y%m%d_%H%M%S')
    results_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for shop in cfg['shops']:
        platform = shop['platform'].lower()
        label = shop.get('username') or shop.get('name') or str(shop.get('shop_id'))
        item = {'platform': platform, 'shop': label, 'checked_at': datetime.now(timezone.utc).isoformat(),
                'status': 'probe_inconclusive'}
        print(f'[{platform}] {label}: resolving...', flush=True)
        try:
            urls, detail = resolve_tiktok(shop, args.timeout) if platform == 'tiktok' else resolve_shopee(shop, args.timeout)
            if not urls:
                item['error'] = detail
            else:
                item['status'] = 'resolved'
                item['capture'] = capture(urls[0], results_dir / f'{platform}_{re.sub(r"[^a-zA-Z0-9_-]", "_", label)}', seconds, interval, args.timeout)
                item['status'] = 'captured' if item['capture']['ok'] else 'capture_failed'
                item['stream_host'] = urlparse(urls[0]).hostname
                print(f"  {item['status']}: {item['capture'].get('frame_count', 0)} frames")
            if item['status'] == 'probe_inconclusive':
                print(f"  probe_inconclusive: {item['error']}")
        except (subprocess.TimeoutExpired, OSError, KeyError, ValueError) as exc:
            item['error'] = safe_error(str(exc))
            print(f"  error: {item['error']}")
        results.append(item)
    report = {'started_at': datetime.now(timezone.utc).isoformat(), 'results': results}
    report_path = results_dir / 'report.json'
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\nReport: {report_path.resolve()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
