#!/usr/bin/env python3
"""Quick direct-stream feasibility probe for TikTok and Shopee Live."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from livestream_qc.config import CONFIG_PATH, RESULTS_DIR, TIMEOUT, load_config
from livestream_qc.probe import probe_all


def main() -> int:
    ap = argparse.ArgumentParser(description='Probe direct livestream playback and capture a few frames.')
    ap.add_argument('--config', type=Path, default=CONFIG_PATH)
    ap.add_argument('--seconds', type=int)
    ap.add_argument('--timeout', type=int, default=TIMEOUT)
    args = ap.parse_args()
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg not found on PATH')
    report_path, _ = probe_all(load_config(args.config), RESULTS_DIR, args.timeout, args.seconds, verbose=True)
    print(f'\nReport: {report_path.resolve()}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
