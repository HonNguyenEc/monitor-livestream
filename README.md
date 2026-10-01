# Livestream QC feasibility demo

## Run

Requirements: Python 3.10+, FFmpeg on PATH, `python -m pip install -r requirements.txt`.

mpv (or mpv.net) is needed for monitoring. If it is missing, run `bash scripts/setup_mpv.sh` (Git Bash on Windows uses winget `shinchiro.mpv`, else scoop; macOS uses Homebrew; Linux uses apt/dnf/pacman/zypper). It exits early when a player is already installed; `--force` installs mpv anyway and `--dry-run` only prints the command.

```powershell
python server.py
```

Settings: copy `.env.example` to `.env` (git-ignored) — `QC_PORT` (dashboard port, default 8765) and `AUTO_LIVES_BACKEND_URL` (the backend `/login` signs in to). Shell environment variables override `.env`.

Batch probe from the CLI: `python qc_probe.py`. Single approach: `python approach_runner.py <browser|direct_stream|desktop_player> <shop_key>`.

Open `http://127.0.0.1:8765`. Each shop card has separate actions for the approaches below. Their reports are isolated under `approach_results/<approach>/<timestamp>/report.json` so results do not overwrite one another.

## Code layout

The root scripts are thin entry points; the logic lives in `livestream_qc/`:

| Module | Responsibility |
| --- | --- |
| `config.py` | Paths, constants, `shops.json` loading, shop key/label helpers |
| `utils.py` | Subprocess helpers, error redaction, timestamps, logging |
| `resolvers.py` | TikTok (room API `api-live/user/room`, yt-dlp fallback) and Shopee (DouyinLiveRecorder-style session API) stream resolution |
| `media.py` | FFmpeg frame capture, single-frame check, HLS command |
| `players.py` | Locate mpv / mpv.net / VLC and build their commands |
| `probe.py` | Batch probe of all shops → `results/<timestamp>/report.json` |
| `approaches.py` | Approaches A/B/C → `approach_results/<method>/<timestamp>/` |
| `streams.py` | Local HLS preview processes for the dashboard |
| `mpv_retry.py` | Continuous mpv loop per shop: reopens mpv on each live, reports `live` only while mpv plays real frames |
| `monitor.py` | "Theo dõi tất cả": keeps one mpv job running for every monitored shop |
| `shop_store.py` | Validated shop add/edit/delete from the dashboard |
| `backend_client.py` | Admin login/refresh against the auto_lives backend and its brand, board and play_url reads |
| `backend_sync.py` | Keeps backend Shopee shops and today's schedules in memory; resolves their play_url |
| `server.py` | Dashboard state and HTTP routes |

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

## Shopee setup

A Shopee shop only needs its **Seller Center cookie**. In the shop's config, paste the `cookie` header of any `banhang.shopee.vn` request; only `SPC_SC_SESSION` is kept, in `shopee_cookies.json` (git-ignored, keyed by `user_id`). On save the cookie is checked against `https://banhang.shopee.vn/api/v2/login/`, which also fills in the shop's `name` (Seller Center username if left empty), `user_id` and `shop_id`. When editing, leave the cookie field empty to keep the stored one.

Resolving a stream:

1. Session: a share link in `live_url` (`https://live.shopee.vn/share?from=live&session=<id>`, `shp.ee` links are followed), else `live.shopee.vn/api/v1/shop_page/live/ongoing?uid=<user_id>` (public, ported from [ihmily/DouyinLiveRecorder](https://github.com/ihmily/DouyinLiveRecorder)).
2. Stream: `https://banhang.shopee.vn/api/supply/lm/sellercenter/realtime/dashboard/sessionInfo?sessionId=<id>` with the cookie returns `sessionStreamingUrl`, a signed FLV on `play-spe.livestream.shopee.vn` with an `expire_ts`. It is fetched fresh on every resolve; FFmpeg/mpv read it without cookies.

A login only sees its own shop's sessions (`seller_center_no_access` otherwise). `seller_center_auth_failed` means the cookie expired: paste a new one. The buyer-side `live.shopee.vn/api/v1/session/<id>` endpoint is not used; Shopee VN blocks it with HTTP 403 / `90309999` even with login cookies.

## Shopee shops through the backend (Open API)

Shops connected to the Shopee Open API in the auto_lives backend need no cookie. Open `http://127.0.0.1:8765/login` and sign in with an **admin** account (email + password only). The backend is always `AUTO_LIVES_BACKEND_URL` from `.env` (default `http://localhost:8000`); after changing it, restart the server and log in again — a saved login for another backend is ignored. The password is only forwarded to `/api/v1/auth/login`; the token pair is kept in `backend_session.json` (git-ignored) and refreshed through `/auth/refresh`. Logging out here only deletes that file — it does not revoke the account's tokens on other devices.

Every 60 s (or on **Đồng bộ**) the tool reads:

1. `GET /api/v1/brands` — brands with `is_connect_shopee` become Shopee shops (key `shopee_api_<hash of brand_id>`, kept in memory, never written to `shops.json`).
2. `GET /api/v1/live-monitor/board?date=<today>` — today's schedules, shown on each shop's panel.

Resolving a stream calls `GET /api/v1/brands/{brand_id}/livestream/play_url?session_id=<id>`: the session of the schedule on air now (15 min before start until 30 min after the planned end), else the brand's current session. The backend reads Shopee `get_session_detail` and returns only `play_url` (signed HTTP-FLV, `expires_at`) while the session is ongoing; the push key and access token never leave the backend. A session started from the Shopee phone app may have no `play_url` (`no_play_url`).
