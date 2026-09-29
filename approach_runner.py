#!/usr/bin/env python3
"""Run an isolated feasibility check for one alternative playback approach."""
from __future__ import annotations

import argparse
import json

from livestream_qc.approaches import METHODS, run_approach
from livestream_qc.config import find_shop


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('method', choices=METHODS)
    parser.add_argument('shop_key')
    args = parser.parse_args()
    shop = find_shop(args.shop_key)
    if not shop:
        raise SystemExit(f'Unknown shop key: {args.shop_key}')
    print(json.dumps(run_approach(args.method, shop), ensure_ascii=False))


if __name__ == '__main__':
    main()
