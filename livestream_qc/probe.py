"""Batch probe: resolve every configured shop and capture sample frames."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from .config import RESULTS_DIR, TIMEOUT, capture_settings, shop_key, shop_label, shop_platform
from .media import capture
from .resolvers import resolve
from .utils import safe_error, timestamp, utc_now, write_json


def probe_shop(shop: dict, out_dir: Path, seconds: int, interval: int, timeout: int = TIMEOUT) -> dict:
    """Resolve one shop and capture frames into `out_dir/<shop_key>`."""
    row = {'platform': shop_platform(shop), 'shop': shop_label(shop), 'key': shop_key(shop),
           'checked_at': utc_now(), 'status': 'probe_inconclusive'}
    try:
        urls, detail = resolve(shop, timeout)
        if not urls:
            row['error'] = detail
            return row
        result = capture(urls[0], out_dir / row['key'], seconds, interval, timeout)
        row.update(capture=result, status='captured' if result['ok'] else 'capture_failed',
                   stream_host=urlparse(urls[0]).hostname)
    except Exception as exc:
        row['error'] = safe_error(str(exc))
    return row


def probe_all(cfg: dict, results_dir: Path = RESULTS_DIR, timeout: int = TIMEOUT,
              seconds: int | None = None, verbose: bool = False) -> tuple[Path, list[dict]]:
    """Probe all shops and write `<results_dir>/<timestamp>/report.json`."""
    capture_seconds, interval = capture_settings(cfg)
    out_dir = results_dir / timestamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for shop in cfg.get('shops', []):
        if verbose:
            print(f'[{shop_platform(shop)}] {shop_label(shop)}: resolving...', flush=True)
        row = probe_shop(shop, out_dir, seconds or capture_seconds, interval, timeout)
        if verbose:
            frames = row.get('capture', {}).get('frame_count', 0)
            print(f"  {row['status']}: " + (f'{frames} frames' if 'capture' in row else str(row.get('error'))))
        rows.append(row)
    report_path = out_dir / 'report.json'
    write_json(report_path, {'started_at': utc_now(), 'results': rows})
    return report_path, rows


def latest_report(results_dir: Path = RESULTS_DIR) -> tuple[Path, dict] | None:
    """Return (report_dir, report) for the most recent batch probe, if readable."""
    reports = sorted(results_dir.glob('*/report.json'), key=lambda p: p.stat().st_mtime, reverse=True)
    if not reports:
        return None
    try:
        return reports[0].parent, json.loads(reports[0].read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None
