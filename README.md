# Livestream QC feasibility demo

## Run

Requirements: Python 3.10+, FFmpeg on PATH, `python -m pip install -r requirements.txt`.

```powershell
python server.py
```

Open `http://127.0.0.1:8765`. Each shop card has separate actions for the approaches below. Their reports are isolated under `approach_results/<approach>/<timestamp>/report.json` so results do not overwrite one another.

## Approach A: Browser page

**Mở trang sàn** opens TikTok's LIVE page. For Shopee, it opens `live_url` if present in `shops.json`, otherwise the seller's shop page so the operator can select the active LIVE manually. This tests whether a human can watch through the platform's own page. It does not claim the video can be embedded in the dashboard or captured automatically.

Expected limitations: platform login, age/region checks, iframe restrictions, and changing page behavior. Shopee needs a share/live link for a direct test of that specific session.

## Approach B: Direct stream

**Probe Direct** resolves and captures a short sample into the dedicated report directory. **Xem qua dashboard** resolves again and uses FFmpeg to make a local HLS preview; the source URL stays on the worker. A resolver error means inconclusive, not offline.

Expected limitations: dynamic/expiring URLs, request headers or cookies, intermittent platform extraction, browser codec/CORS constraints, and FFmpeg/network load per concurrent stream.

## Approach C: Desktop player

**Mở mpv / VLC** checks for mpv or VLC, resolves the stream, then launches the installed player. This avoids an emulator and is useful for manual viewing, but it does not provide a browser dashboard feed or automated QC. Install mpv/VLC separately if desired.

## Reserved for later

Real Android controlled through ADB is intentionally not included in this demo; it remains the final fallback option.

## Shopee identifiers

`shop_id` and `user_id` identify the seller, not the active stream session. Shopee direct playback needs a current `session_id` or a live share URL from which it can be discovered. The current script does not guess one from seller IDs.
