# Live QC API contract (v1)

|                 |                                                                        |
| --------------- | ---------------------------------------------------------------------- |
| Provider        | `monitor-livestream` (this repo, NestJS service)                       |
| Consumer        | `livestream-admin` (Live QC pages)                                     |
| Source of truth | this document + `docs/openapi/live-qc.json`                            |
| Change rule     | shape changes land here first, then in code; never the other way round |

## Implementation status

Every endpoint below exists and is `real`. A change that makes an endpoint return sample data again must say so in this column and in the changelog.

`real (backend)` means the backend login and sync are real. The login is stored in `backend_session.json` and refreshed when the backend answers 401. Once logged in, the service reads `/brands` (every 10 minutes) and today's `/live-monitor/board` (every 2 minutes, and when the local date changes) from livestream-backend, and `POST /backend/sync` reads both now. Without a login the service makes no backend call and lists no backend channel. After a failed read the last good lists stay, `error` carries the masked reason and the next try waits 60 s, doubling to at most 600 s (the backend's `Retry-After` replaces the 60 s when sent, still capped at 600 s; a `Retry-After` of 0 is ignored). A logout, a login that ends, or a new login clears everything synced. A `POST /backend/sync` or login that arrives while a full sync of the same login is running shares its result instead of reading again. The login email is trimmed before it is checked.

`real (local)` means local channels come from the service's own `shops.json`. A channel without a detection job reports `status: "not_checked"`, `job_state: "stopped"`, `attempts: 0` and null `message`, `checked_at`, `live_since` and `frame_url`; one with a job reports what its job found (Detection behaviour). Backend channels (`source: "backend"`) are the connected Shopee Open API brands that the logged-in account can see (livestream-backend scopes `/brands`); they report detection the same way. Their `key` is `shopee_api_<first 10 hex of sha1(brand id)>` and their `label` is the brand name. `GET /shops/:key` of a backend channel adds today's `schedules` (session ids masked, no account id), `on_air_schedule_id` (the schedule whose session was last found live, else the likeliest one from 15 minutes before its start to 30 minutes after its planned end) and `session` (what the last play URL lookup answered, `null` until one ran; it never holds the URL).

## Basics

- **Base URL:** `http://127.0.0.1:<QC_PORT>/api/v1` (default port 8765; `localhost` works too). The service runs on the operator's own machine, installed from a Windows installer, so the admin app uses `http://127.0.0.1:8765` as its default in code; `VITE_LIVE_QC_URL` in a local `.env` only overrides it.
- **Auth:** none. Do not send the admin `Authorization` header. Any logged-in admin user may call the service on their own machine. Brand access is enforced by livestream-backend through the account the operator logs the service in with (`POST /backend/login`, admin accounts only).
- **CORS:** only origins in the service's `ALLOWED_ORIGINS` (dev default `http://localhost:3004`).
- **Local-only requests:** the `Host` header must name `127.0.0.1`, `localhost` or `[::1]` (any port, any letter case), otherwise `403 HOST_NOT_ALLOWED`. A write (anything but GET/HEAD/OPTIONS) whose `Origin` header is neither in `ALLOWED_ORIGINS` nor the service's own origin (Swagger UI at `/docs`) gets `403 ORIGIN_NOT_ALLOWED`. Any request, a read included, that the browser marks `Sec-Fetch-Site: cross-site` is refused with `403 ORIGIN_NOT_ALLOWED` unless its `Origin` is in `ALLOWED_ORIGINS` (a page of another site cannot read the service by an image, script or form request). Same-origin, same-site and user-typed requests (`same-origin`, `same-site`, `none`) and clients that send no `Sec-Fetch-Site` header (curl, the Python tool) are not affected. `ALLOWED_ORIGINS` lists the pages that call the service, such as the admin dev server, not the service's own address. A dev proxy that keeps the browser `Host` and `Origin` passes both checks. **A proxy must not rewrite `Host` to a loopback name** (e.g. Vite `changeOrigin: true`): that lets any host the proxy serves, such as a public tunnel, reach the service.
- **JSON:** field names are `snake_case`.
  - Timestamps are ISO-8601 strings with an offset.
  - Nullable fields are always present and set to `null`; they are never omitted.
- **Ids:** shop `key` is an opaque URL-safe string (`[a-zA-Z0-9_-]+`). Every route with a `:key` returns `404 SHOP_NOT_FOUND` for an unknown key.
  - Session ids are masked (`•••1234`).
  - Brand ids never appear.

## OpenAPI and generated types

- Swagger UI: `http://127.0.0.1:<QC_PORT>/docs`. Raw JSON: `/docs-json`.
- Committed artifact: `docs/openapi/live-qc.json`.
  - Regenerate it with `npm run openapi:export` in every commit that changes a shape.
  - It is generated from the DTO classes. The e2e suite fails when the committed file differs from the document the code produces.
- Consumer types: `npx openapi-typescript <path-to-this-repo>/docs/openapi/live-qc.json -o src/modules/live-qc/api.types.ts` in livestream-admin. Use `components['schemas']['ShopRowDto']` and the other schemas instead of hand-written interfaces.
- Every operation documents `403` (`HOST_NOT_ALLOWED` / `ORIGIN_NOT_ALLOWED`), every operation with a body documents `400 BAD_REQUEST`, and each route lists its own domain errors with the status from the Errors table.

## Errors

Every non-2xx response has the same envelope as livestream-backend, so `getDetailMsg` / `getErrorCode` / `getRequestId` in `src/common/utils/apiError.ts` work unchanged:

```json
{
  "detail": "Không tìm thấy kênh x.",
  "error": { "code": "SHOP_NOT_FOUND", "message": "Không tìm thấy kênh x.", "request_id": "uuid" }
}
```

`error.code` is published in `docs/openapi/live-qc.json` as the enum `ErrorCode`: every code of this table plus the HTTP status names of other errors, so the consumer generates its type instead of listing codes by hand.

`detail` and `error.message` are Vietnamese text the page may show as is, for every domain error and both `403` refusals. Branch on `error.code`, never on the text. Request validation (`BAD_REQUEST` from the validation pipe) and unexpected `500` errors still answer in English.

| `error.code`                            | HTTP     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHOP_NOT_FOUND`                        | 404      | Unknown shop key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `SHOP_ALREADY_EXISTS`                   | 409      | A shop with the resulting key already exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `BACKEND_SHOP_READ_ONLY`                | 409      | Shops synced from livestream-backend cannot be edited or deleted here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `FRAME_NOT_FOUND`                       | 404      | No frame captured yet for this shop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `NO_PLATFORM_SELECTED`                  | 400      | `POST /monitor/start` without platforms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `BACKEND_NOT_CONNECTED`                 | 400      | The service has no backend login                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `BACKEND_LOGIN_FAILED`                  | 400      | The login was refused; `detail` says why: wrong credentials, an account that is not admin/super_admin, an `AUTO_LIVES_BACKEND_URL` that is not an http(s) URL, livestream-backend not answering, an answer without a token pair, or another refusal from it (its HTTP status and message)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `STREAM_UNAVAILABLE`                    | 502      | A fresh stream URL could not be resolved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SHOPS_FILE_UNREADABLE`                 | 500      | `shops.json` is locked, not valid JSON, or its `shops` value is not a list; every route that reads shops lists it (`/shops*`, `detection/start`, `frame`, `/settings/layout`, `/wall*`), and nothing is overwritten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `COOKIES_FILE_UNREADABLE`               | 500      | `shopee_cookies.json` is locked or not valid JSON; `POST`/`PUT /shops` for a Shopee shop refuse to write (nothing is overwritten) and list it, while reads show `cookie_set: false` and `DELETE` still succeeds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `LAYOUT_FILE_UNREADABLE` | 500 | `mpv_layout.json` is locked or not a JSON object; `PUT /settings/layout` refuses to write (nothing is overwritten) and lists it, while `GET /settings/layout` shows the defaults |
| `HOST_NOT_ALLOWED`                      | 403      | The `Host` header is not a loopback name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ORIGIN_NOT_ALLOWED`                    | 403      | A write came from an origin outside `ALLOWED_ORIGINS`, or a request the browser marks cross-site came without an allowed `Origin`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `BAD_REQUEST`                           | 400      | The request body failed validation: a wrong type, a value outside an enum, a missing required field, or a field the endpoint does not accept. `detail` lists every problem, joined with `, `. Also a value only the service can check, with one Vietnamese message in `detail`: a field the shop's platform does not use, a TikTok username that is only `@`, a Shopee `live_url` that is not an https `shopee.vn` / `shp.ee` address, a Shopee cookie without `SPC_SC_SESSION` or whose value has characters outside printable ASCII (`detail` never repeats the value), one Seller Center rejects (`detail` says the cookie was refused) or cannot check right now (`detail` says Seller Center is unreachable: network failure, timeout, 5xx, 429 or a 200 whose body is not JSON), or a Shopee edit that the stored cookie cannot cover |
| `NOT_FOUND`, `INTERNAL_SERVER_ERROR`, … | as named | Other generic errors use the HTTP status name (`HttpStatus` of NestJS: every 4xx and 5xx name)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Enums

| Enum        | Values                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`  | `tiktok`, `shopee`                                                                                                                                                                  |
| `source`    | `local` (stored in this service), `backend` (Shopee Open API brand synced from livestream-backend)                                                                                  |
| `status`    | `live`, `offline` (platform says not live), `unknown` (could not tell), `no_signal` (stream opened but no frames), `checking` (job running, no verdict yet), `not_checked` (no job) |
| `job_state` | `stopped`, `retrying`, `checking_image`, `playing`, `stopping`, `error`                                                                                                             |
| `reason_code` | `not_live`, `no_stream_url`, `cookie_missing`, `cookie_invalid`, `cookie_store_unreadable`, `seller_center_no_access`, `invalid_live_url`, `missing_user_id`, `lookup_failed`, `platform_unreachable`, `backend_not_connected`, `backend_error`, `unsupported`, `tool_missing`, `player_failed`, `no_frames`, `internal_error` (see Detection behaviour) |
| `detector`  | `mpv`, `ffmpeg`                                                                                                                                                                     |
| `aspect`    | `9:16`, `16:9`, `3:4`, `1:1`                                                                                                                                                        |

## Endpoints

| Method & path                      | Request                                    | Response                                                                                                                                     | Status                                                                |
| ---------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /health`                      | —                                          | `{product: "live-qc", status: "ok", version}`                                                                                                                    | real                                                                  |
| `GET /shops`                       | —                                          | `{items: ShopRow[]}`: local channels in `shops.json` order, then backend channels                                                            | real (local + backend)                                                |
| `GET /shops/:key`                  | —                                          | `ShopDetail`                                                                                                                                 | real (local + backend)                                                |
| `POST /shops`                      | `CreateShop`                               | `201 ShopDetail`                                                                                                                             | real                                                                  |
| `PUT /shops/:key`                  | `UpdateShop`                               | `ShopDetail`, under the shop's new key when the change renames it                                                                            | real                                                                  |
| `DELETE /shops/:key`               | —                                          | `204`                                                                                                                                        | real                                                                  |
| `POST /shops/:key/detection/start` | —                                          | `DetectionState`                                                                                                                             | real                                                                  |
| `POST /shops/:key/detection/stop`  | —                                          | `DetectionState`                                                                                                                             | real                                                                  |
| `GET /shops/:key/frame`            | —                                          | `image/jpeg`, or `404 FRAME_NOT_FOUND` while no frame exists                                                                                 | real                                                                  |
| `GET /monitor`                     | —                                          | `MonitorState`                                                                                                                               | real                                                                  |
| `POST /monitor/start`              | `{platforms: platform[], keys?: string[]}` | `MonitorState`                                                                                                                               | real                                                                  |
| `POST /monitor/stop`               | —                                          | `MonitorState`                                                                                                                               | real                                                                  |
| `GET /backend/status`              | —                                          | `BackendStatus`                                                                                                                              | real (backend)                                                        |
| `POST /backend/login`              | `{email, password}`                        | `BackendStatus` (after a first sync, whose failure shows in `error`), or `400 BACKEND_LOGIN_FAILED`                                          | real (backend)                                                        |
| `POST /backend/logout`             | —                                          | `BackendStatus`                                                                                                                              | real (backend)                                                        |
| `POST /backend/sync`               | —                                          | `BackendStatus` after reading brands and board now (a failed read is `200` with `error` set), or `400 BACKEND_NOT_CONNECTED` without a login | real (backend)                                                        |
| `GET /settings/layout`             | —                                          | `LayoutSnapshot`                                                                                                                             | real (settings in `mpv_layout.json`; `tiles` come from the channels); `screen`, `area`, `rows` and `columns` are sample until the grid layout (Phase 4b) |
| `PUT /settings/layout`             | partial `LayoutSettings`                   | `LayoutSnapshot`                                                                                                                             | real (saved to `mpv_layout.json`); `screen`, `area`, `rows` and `columns` are sample, as in `GET` |
| `GET /wall`                        | —                                          | `Wall`                                                                                                                                       | real                                                                  |
| `POST /wall/:key/refresh`          | —                                          | `{url}` or `502 STREAM_UNAVAILABLE`                                                                                                          | real                                                                  |

Request bodies are validated. A field the request shape does not list is rejected with `400 BAD_REQUEST`.

### Shapes

```ts
ShopRow = {
  key: string; platform: Platform; label: string; source: 'local' | 'backend';
  status: Status; job_state: JobState; attempts: number; message: string | null;
  reason_code: ReasonCode | null;   // why the channel is not live; null when there is nothing to explain (set by detection while a job runs or ended in error)
  checked_at: string | null; live_since: string | null;
  frame_url: string | null;   // path from the host root, e.g. /api/v1/shops/<key>/frame?t=<ms>; null until the first frame
  cookie_set: boolean;        // local Shopee shops: a Seller Center cookie is stored
}
// frame_url is non-null exactly when GET /shops/:key/frame returns an image; its `t` query changes with every new frame.
// Load the image with GET /shops/:key/frame through the API client, so its base URL (and the dev proxy) applies.

ShopDetail = ShopRow & {
  config: { platform; username?; name?; user_id?; shop_id?; live_url? } | null; // backend shops: {platform, name}
  session: { session_id; shopee_status: number | null; is_live; title; share_url; expires_at;
             source; schedule_id; checked_at } | null;                         // backend shops only
  schedules: { schedule_id; platform; scheduled_at; expected_end_at; status; status_label;
               schedule_status; session_id }[];                               // today's, backend shops only
  on_air_schedule_id: string | null;
}

CreateShop = { platform; username?; name?; user_id?; shop_id?; live_url?; cookie? }
// tiktok: username required. shopee: cookie required (raw `cookie` header of a banhang.shopee.vn request).
// Each platform takes only its own fields; another platform's field with a non-null value is 400 BAD_REQUEST:
//   tiktok: username (leading @ dropped), live_url     shopee: name, user_id, shop_id, live_url, cookie
// live_url: TikTok takes any http(s) URL; Shopee takes only an https URL on shopee.vn or shp.ee (or a subdomain), the
//   same allow-list the stream resolver applies, so a link the resolver would refuse is refused on save. The rule applies to a `live_url` the request sends; a value already stored is kept when other fields are edited.
// Strings are trimmed. The key comes from username (TikTok) or name (Shopee), so a rename changes the key;
// a key another shop already has is 409 SHOP_ALREADY_EXISTS. Fields shops.json holds beyond these are kept.
// Shopee: only SPC_SC_SESSION is kept from the pasted cookie, and it is checked with Seller Center
//   (GET banhang.shopee.vn/api/v2/login/) before anything is saved. user_id and shop_id come from that login
//   (a typed user_id must match it); name defaults to the Seller Center username, else the user_id.
//   The cookie is stored per user_id and is never returned; cookie_set tells whether one is stored.
//   PUT without cookie needs a stored cookie for the shop's user_id and cannot change user_id; a cleared name
//   then falls back to the user_id. Without a cookie `user_id: null` is ignored (the stored user_id stays,
//   as in the Python tool). To move a shop to another Seller Center account, send its cookie with
//   user_id: null. A cookie no remaining shop uses is dropped.
UpdateShop = CreateShop without platform. An omitted field stays unchanged; `null` clears an optional field
// (`name`, `shop_id`, `live_url`); `user_id: null` only takes effect with a Shopee `cookie`, which then
// sets it from the login (without one the stored user_id stays); `''` is rejected with 400. `username` and `cookie` cannot be null;
// omit `cookie` to keep the stored one.

DetectionState = { key: string; state: JobState; message: string | null; reason_code: ReasonCode | null }
MonitorState = { running: boolean; platforms: Platform[]; keys: string[] | null }
// platforms: what POST /monitor/start selected, [] while stopped. keys: null = every shop of those platforms.
// A start without keys, or with `keys: null`, monitors every shop of its platforms, even when an earlier start listed keys; `keys: []` monitors none.

BackendStatus = { connected; backend /* masked host */; email /* masked */; name; role;
                  synced_at: string | null; error: string | null; brands: number; schedules: number;
                  api_calls_5m: number }
// The service logs in with an admin or super_admin account of the livestream-backend named by AUTO_LIVES_BACKEND_URL
// (data-folder .env, default http://localhost:8000). The password is never stored. A stored login for another
// backend is ignored. Logout is local only: it does not revoke the tokens on the backend.
// api_calls_5m: requests this service made to livestream-backend over the last 5 minutes.
// synced_at: the last successful sync (UTC ISO 8601), null before one. error: the masked reason of the last failed sync,
//   null after a success. brands: connected Shopee brands synced; schedules: board rows synced for today (all brands).
//   Without a login: synced_at null, brands and schedules 0 (error may still say why the login ended).

LayoutSettings = { enabled; x; y; width; height /* either 0 = full work area */; rows; columns /* 0 = auto */;
                   gap; aspect: Aspect; live_only; ontop; detector: Detector; show_mpv }
// Settings live in mpv_layout.json in the data folder, with the keys and defaults of the Python tool (except `show_mpv`, which defaults to `false`), and are re-read on every call.
// A saved value is clamped like the Python tool does: x, y -20000..20000; width, height 0..20000 (either under 200 x 150 resets both to 0);
// rows, columns 0..12; gap 0..100. A missing file reads as the defaults; a file the service cannot read is never overwritten (LAYOUT_FILE_UNREADABLE).
// A successful PUT restarts running detection jobs only when `detector` or `show_mpv` changed (as the Python tool does), so they pick up the new detector or window mode.
LayoutSnapshot = { settings: LayoutSettings; screen: Area; area: Area; aspects: Aspect[];
                   detectors: Detector[]; rows; columns; tiles: { key; label; live; visible }[] }

Wall = { settings: { rows; columns; gap; aspect; live_only }; detector: Detector;
         tiles: { key; label; live; visible; url: string | null }[] }  // url: signed HTTP-FLV, expires
```

## Detection behaviour

This section is the target behaviour of real detection. It matches the Python tool (`livestream_qc/mpv_retry.py`) unless it says otherwise.

### Job lifecycle

- One job per channel key. `POST /shops/:key/detection/start` creates it (`job_state: retrying`, `attempts: 0`) or, when one is already running, answers its current state without starting a second job.
- Each attempt resolves a stream URL, then checks that real frames arrive. A new attempt rebuilds the resolve request, so a cookie saved after the job started is used by the next attempt.
- `job_state` moves `retrying` (resolving) -> `checking_image` (player or FFmpeg opened the stream, waiting for frames, at most 20 s) -> `playing` (frames seen; frames are checked again every 30 s). A stream that stalls, a closed player or an expired URL goes back to `retrying`, so the next live is caught.
- `POST /shops/:key/detection/stop` ends the job (`stopping`, then `stopped`) and kills the player or FFmpeg it started. It works by key even when the shop no longer exists, and answers `stopped` for a key without a job; it never answers `404 SHOP_NOT_FOUND`.
- A job that cannot start its tool (player or FFmpeg not found, player failed to launch) ends in `job_state: error` with a `reason_code` (`tool_missing`, `player_failed`) and stops retrying; starting it again retries.
- The player is mpv.exe, or mpvnet.exe when only that is installed. A launched mpvnet needs `--process-instance=multi`, or it hands the URL to a window that already exists and the channel's own window never opens; every player gets its own `--config-dir` under the service's `runtime` folder.
- A job ending on its own releases its wall tile. `attempts` counts resolve attempts since the job started.

### Verdict rules

An attempt that resolves or opens a stream ends in a verdict, the channel `status`:

- `live`: real frames were seen.
- `offline`: the platform says the channel is not live (a `not_live` resolve failure, or yt-dlp's "not currently live").
- `no_signal`: the stream URL opened but no frames arrived within the 20 s check.
- `unknown`: any other failed resolve (no play URL, cookie, backend, network or tool problem).

Some outcomes record **no verdict**, as in the Python tool: a playing stream that stalls (no new frames for 30 s), a player window that was closed, and FFmpeg losing frames it had seen. The job goes back to `retrying` and the next attempt's outcome is the one that counts, so a live channel with one hiccup stays `live`.

Every verdict except `live` counts as a miss, failed resolves included. A channel that was `live` keeps reporting `live` until it has 2 consecutive misses; the 2nd miss reports the new verdict. A `live` verdict resets the miss count. `live_since` is set when the status becomes `live` and cleared when it leaves it.

While no job runs, `status` is `not_checked` and `checked_at`, `live_since` and `message` are null. While a job runs and has no verdict yet, `status` is `checking`. A job in `error` reports `not_checked`.

### Unlike the Python tool

These choices are deliberate; everything else in this section is Python behaviour.

- FFmpeg or mpv missing is a job in `error` with `reason_code: tool_missing`. In Python a missing FFmpeg makes every grab fail and the job loops on `no_signal`. The tool of the selected detector is checked before every attempt, so a missing one ends the job before any resolve (Python checks mpv once, when the job starts).
- A job in `error` has `message: null`. Python keeps a Vietnamese text there; here the admin writes the text from `job_state` and `reason_code`, and the service never sends operator prose in `message`: `message` is `null` in every state.
- An unexpected exception in one attempt is `unknown` / `internal_error` and the job keeps retrying after its normal delay; when it repeats, the wait grows to 30 s, then 60 s, and returns to normal after an attempt that does not fail. In Python the job's thread dies.
- A Shopee channel whose cookie failed (`cookie_missing`, `cookie_invalid`, `cookie_store_unreadable`) twice in a row with the same stored cookie stops retrying and waits, checking the stored cookie every 5 s, until it changes; the 2 misses are the ones the live grace rule needs. Python retries every 15 s.
- Stopping a job forgets its frame: `frame_url` is `null` and `GET /shops/:key/frame` is `404 FRAME_NOT_FOUND` until the next start finds one.
- A `shops.json` that cannot be read while a job runs is no verdict: the attempt is skipped and tried again after the normal wait, so a live channel does not drift to `unknown`.
- The monitor starts its jobs with the 2 s pause between starts only, not after the last one, and it follows a rename of a channel its keyed selection names (Monitor).
- `live_only` lists only live tiles; Python also lists the others with `visible: false`. `visible` is always `true` until the grid layout exists (Python hides what does not fit `rows` x `columns`).
- A stop waits at most 5 s for the processes of a job to end before it answers (`POST /shops/:key/detection/stop`, `POST /monitor/stop`, a delete or rename); a process still running after that is left to the kill already asked for. Python does not wait.
- After frames are lost or the player exits, the next attempt waits 3 s. Python resolves again at once, so a player window the operator closes would reopen with no pause.
- `show_mpv` defaults to `false`: with it on, every channel opens its own free-floating window until the desktop grid window exists (Python embedded them in one window).
- `reason_code` itself, and the `cancelled` outcome, do not exist in Python.

Wait before the next attempt, by platform (a backend channel counts as `shopee`):

| After                                      | tiktok | shopee |
| ------------------------------------------ | ------ | ------ |
| `offline` verdict (platform says not live) | 20 s   | 60 s   |
| any other failed resolve                   | 5 s    | 15 s   |
| `no_signal` (opened, no frames)            | 3 s    | 3 s    |
| frames lost or the player exited           | 3 s    | 3 s    |

### Resolve budget

- One resolve has one budget (25 s unless a caller sets another). Every HTTP request of it shares that budget: each hop of a redirect chain, and for a backend channel the first try, the wait for a 401 token refresh and the retry together. A job that is stopped aborts all of them at once.
- TikTok is the exception, as in the Python tool: when the room API fails, yt-dlp gets a whole budget of its own, so a TikTok resolve can take up to two budgets. A room API that used up its time never starves the fallback.
- A resolve the caller aborted ends as `cancelled`. It says nothing about the channel: no verdict, no log, and the backend play URL answer is neither cached nor counted in a failure streak.
- A yt-dlp run killed at its timeout is reported as `yt-dlp timed out`.
- yt-dlp is looked up in the `tools` folder of the data folder, then on PATH; none found is `tool_missing`. At most 2 yt-dlp processes run at once, and a run that waits for a free slot spends its budget while it waits.

### Reason codes and the verdict table

`reason_code` says why a row is not live (`null` when there is nothing to explain). The service exposes codes only; the admin owns the operator text and the next step (for `cookie_missing` and `cookie_invalid`: update the cookie).

| `reason_code`             | Meaning                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `not_live`                | The platform says the channel is not live                            |
| `no_stream_url`           | Live, but no playable stream URL was found                           |
| `cookie_missing`          | The Shopee channel has no stored Seller Center cookie                |
| `cookie_invalid`          | Seller Center refused the stored cookie; the operator must update it |
| `cookie_store_unreadable` | `shopee_cookies.json` cannot be read; updating a cookie would fail the same way, so the operator is not asked to |
| `seller_center_no_access` | The Seller Center account cannot reach this channel                  |
| `invalid_live_url`        | The channel's `live_url` is not accepted                             |
| `missing_user_id`         | A Shopee channel has no `user_id`                                    |
| `lookup_failed`           | The ongoing-session lookup failed                                    |
| `platform_unreachable`    | The platform or yt-dlp could not be reached or answered badly        |
| `backend_not_connected`   | A backend channel, and the service has no backend login              |
| `backend_error`           | livestream-backend refused or failed the play URL request            |
| `unsupported`             | No resolver for this channel                                         |
| `tool_missing`            | mpv, FFmpeg or yt-dlp is not installed                               |
| `player_failed`           | The player could not be launched                                     |
| `no_frames`               | The stream opened but showed no frames                               |
| `internal_error`          | An unexpected error ended the attempt                                |

Failed resolve (`ResolveFailureCode`) to `status` / `reason_code`:

| Resolve failure                                | `status`  | `reason_code`             |
| ---------------------------------------------- | --------- | ------------------------- |
| `not_live`                                     | `offline` | `not_live`                |
| `no_play_url`                                  | `unknown` | `no_stream_url`           |
| `missing_cookie`                               | `unknown` | `cookie_missing`          |
| `invalid_cookie`                               | `unknown` | `cookie_invalid`          |
| `seller_center_auth_failed`                    | `unknown` | `cookie_invalid`          |
| `seller_center_no_access`                      | `unknown` | `seller_center_no_access` |
| `invalid_live_url`                             | `unknown` | `invalid_live_url`        |
| `missing_user_id`                              | `unknown` | `missing_user_id`         |
| `ongoing_lookup_failed`                        | `unknown` | `lookup_failed`           |
| `shopee_request_failed`                        | `unknown` | `platform_unreachable`    |
| `ytdlp_failed`, text says "not currently live" | `offline` | `not_live`                |
| `ytdlp_failed`, yt-dlp not installed           | `unknown` | `tool_missing`            |
| `ytdlp_failed`, anything else                  | `unknown` | `platform_unreachable`    |
| `backend_not_connected`                        | `unknown` | `backend_not_connected`   |
| `backend_error`                                | `unknown` | `backend_error`           |
| `unsupported`                                  | `unknown` | `unsupported`             |
| `cancelled`                                    | none      | none (the job was stopped; never shown) |

Other outcomes: a `shopee_cookies.json` that cannot be read (`COOKIES_FILE_UNREADABLE` while the job builds its request) is `unknown` / `cookie_store_unreadable`, never `cookie_missing`; no frames in the 20 s check is `no_signal` / `no_frames`; a missing player or FFmpeg is `job_state: error` / `tool_missing`; a launch failure is `job_state: error` / `player_failed`; an unexpected exception is `unknown` / `internal_error` and the job keeps retrying after its normal delay.

### Lifecycle rules

- Deleting a local channel or renaming it (its key changes) stops the job of the old key and kills its player before the request answers (Shops calls a stop port that Detection implements; nothing reads back). A renamed channel starts idle under its new key (a running monitor that selected the old key starts it from its next pass, see Monitor); the old key reports nothing.
- A backend channel has no edit to hook: its job ends when the login epoch it started under changes (`POST /backend/logout`, a new login, a refused refresh), and when the channel disappears from a sync. Every job checks both on each attempt and on each 30 s watch tick, so such a job ends within 30 s.
- A job rebuilds its resolve request on every attempt from the channel as it is then; when the channel no longer exists the job stops.
- `stop` works by key, whether or not the shop still exists.

### Detectors

The `detector` setting picks how a job tells that a stream shows real frames; a change restarts the running jobs (`PUT /settings/layout`). `mpv` is the default.

- **mpv**: keeps a player on the stream and asks it over its IPC pipe how many video frames it has shown (`estimated-frame-number`). The first frame must come within 20 s (asked once a second; a slow pipe answer does not stretch the window); then every 30 s the count must have grown, or it is a stall. A stall, or a player that exited, records no verdict and the job resolves again. A frame picture is saved with `screenshot-to-file` at the first frame and every 30 s, to a temp file and then renamed. An IPC error or timeout counts as 0 frames. A player that exits is noticed at once (Python: at the next 30 s check): before its first frame that is `no_signal` without waiting out the 20 s, later it is lost frames. While it plays, every 30 s check that finds growth reports live again, which moves `checked_at` and `frame_url` (Python reports live once, at the first frame, and only refreshes the picture after). The service logs why a player ended without a frame (its exit code or the IPC failure).
- mpv command line: `--config-dir` (a folder per channel under `runtime`), `--no-terminal`, `--input-ipc-server` (a new pipe name per launch), `--keep-open=no`, `--title`, then the URL. With `show_mpv` off the player has no window: `--vo=null --ao=null`, plus `--media-controls=no` when it is the bundled mpv or reports version 0.42 or later (older builds refuse the option). With `show_mpv` on it opens its own window with `--force-window=yes`; placing windows on the wall grid comes with the layout work, so until then they are free-floating. mpv.net is launched with `--process-instance=multi`; it ignores `--vo=null`, so hidden it is muted and still opens its window (as in Python).
- The player is looked up once and remembered (a missing one is looked for again after 30 s, and after a failed launch). No mpv is `job_state: error` / `tool_missing`; a launch that fails is `error` / `player_failed`. Stopping a job closes its IPC and kills the player with its process tree before the stop answers.
- **ffmpeg**: grabs a frame every 30 s, no player stays connected.

### Monitor

`POST /monitor/start` keeps one detection job per selected channel, as `monitor.py` does. The selection (platforms, and keys unless `null`) lives in memory, so a service restart ends monitoring, as in Python.

- A pass runs at once and then 5 s after the previous one ended; passes never overlap. It starts a job for every selected channel the monitor has not started yet, 2 s apart, and stops the job of a channel the monitor started that is no longer selected or no longer listed.
- A second `POST /monitor/start` replaces the selection and applies at once; it cuts a start queue short.
- A job already running for a selected channel (started by hand) is adopted: it is kept, and stops with the monitor or when its channel leaves the selection. A job of a channel outside the selection is never touched.
- A job that ends on its own (`error`) or that the operator stops by hand is not started again by the monitor until its channel leaves the selection and comes back, or the monitor is started again, as in Python.
- `POST /monitor/stop` stops every job the monitor started or adopted before it answers.
- A `shops.json` that cannot be read skips the pass: nothing is stopped, the next pass tries again.
- `keys` in `MonitorState` come sorted.
- Unlike Python, renaming a channel that a keyed selection names moves the selection to the new key, so the channel is monitored under it from the next pass. A selection with `keys: null` already includes it.

### Wall tile rule

As in the Python tool, a channel has a wall tile only while its job runs (`retrying`, `checking_image` or `playing`). A channel without a running job is not in `tiles` of `GET /settings/layout` or `GET /wall`. Live channels come first, then the others in the order their jobs started; with `live_only`, only live ones are listed. A tile of a channel that no longer exists is not listed.

### Wall

- `GET /wall` and `GET /settings/layout` list tiles by the wall tile rule above. A live tile's `url` is the stream URL its job resolved last; the read never resolves. A tile that is not live has `url: null`.
- `POST /wall/:key/refresh` resolves a new URL now, for any existing channel, with or without a job. Callers that arrive while a resolve of the same key runs share it. A running job keeps the new URL for the next viewers. When nothing resolves (not live, a failed lookup, an unreadable cookie file), the answer is `502 STREAM_UNAVAILABLE`.

### Reads have no side effects

No `GET` makes a network call or starts a process. `GET /shops`, `GET /shops/:key`, `GET /shops/:key/frame`, `GET /settings/layout`, `GET /wall`, `GET /monitor` and `GET /backend/status` only read what the service already holds (files, the backend sync it did on its own schedule, the detection state in memory). Work that reaches outside the service happens only on a write (`POST` / `PUT` / `DELETE`), from a job, or from the sync loop.

## Pages and the APIs they need (consumer side)

All pages sit in a `live-qc` nav group, each on its own route. Each page polls only what it shows, every 5 s unless noted.

| Page (route)                                       | Shows                                                                                           | APIs                                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Channels `/dashboard/live-qc/channels`             | shop list, filters (platform, status, search), start/stop monitoring for all or ticked shops    | `GET /shops`, `GET /monitor`, `POST /monitor/start`, `POST /monitor/stop`                                                     |
| Channel detail `/dashboard/live-qc/channels/:key`  | tabs: overview (status, frame, start/stop detection), session & schedules, config (edit/delete) | `GET /shops/:key`, `GET /shops/:key/frame`, `POST /shops/:key/detection/start\|stop`, `PUT /shops/:key`, `DELETE /shops/:key` |
| Add channel `/dashboard/live-qc/channels/new`      | form for a TikTok username or a Shopee cookie shop                                              | `POST /shops`                                                                                                                 |
| Live wall `/dashboard/live-qc/wall`                | grid of live streams played with `mpegts.js` (FLV), sound on one tile at a time                 | `GET /wall`; on a player error or a 15 s stall, `POST /wall/:key/refresh` with backoff                                        |
| Settings `/dashboard/live-qc/settings`             | detector (mpv/ffmpeg), mpv window grid and position, live-only, preview                         | `GET /settings/layout`, `PUT /settings/layout`                                                                                |
| Backend connection `/dashboard/live-qc/connection` | the service's own admin login to livestream-backend, sync button                                | `GET /backend/status`, `POST /backend/login\|logout\|sync`                                                                    |

Frontend setup the consumer adds:

- the default base URL `http://127.0.0.1:8765` in code; `VITE_LIVE_QC_URL` in a local `.env` only overrides it. No Dockerfile, CI workflow or deployment changes.
- a dev proxy entry in `vite.config.mts` that keeps the browser `Host` (`changeOrigin: false`)
- a second axios instance without the bearer-token interceptor
- an install/update banner on every Live QC page: `GET /health` failing, or answering without `product: "live-qc"` (another program holds the port), means the service is not running (show the installer download link); `version` below the admin's minimum service version means it must be updated
- a `src/modules/live-qc` module
- the `mpegts.js` dependency

All pages sit under one parent nav item, "Live QC", and are open to any logged-in user (not `superAdminRoute`).

## Changelog

- v1: all endpoints above. `/health` is real; every other endpoint returns sample data.
- v1 + Swagger: added `/docs` and the exported `docs/openapi/live-qc.json`. No shape changes.
- v1 + validation: request bodies are validated (`400 BAD_REQUEST`, unknown fields rejected). `detection/*`, `frame` and `wall/:key/refresh` return `404 SHOP_NOT_FOUND` for an unknown key. Response shapes are unchanged.
- v1 + local guard: `403 HOST_NOT_ALLOWED` and `403 ORIGIN_NOT_ALLOWED` on every route. Response shapes are unchanged.
- v1 + monitor platforms: `MonitorState` gains `platforms: Platform[]` (`[]` while stopped). Regenerate the consumer types.
- v1 + access model: the service takes no bearer token, so the document no longer declares a security scheme; the admin app defaults to `http://127.0.0.1:8765`. Response shapes are unchanged.
- v1 + same-origin writes: writes from the service's own origin (Swagger UI) are accepted. Response shapes are unchanged.
- v1 + null clears: in `PUT /shops/:key`, `null` clears `name`, `shop_id` or `live_url` (`user_id: null` only with a Shopee cookie, see the shape note), an omitted field stays unchanged, and `''` is rejected (`name: ''` was accepted before). `UpdateShopDto` marks those four fields nullable. Regenerate the consumer types.
- v1 + local shops: `GET /shops` and `GET /shops/:key` read local channels from `shops.json` in the data folder, with the same keys and labels as the Python tool. Backend channels stay sample data. Response shapes are unchanged.
- v1 + TikTok writes: `POST /shops`, `PUT /shops/:key` and `DELETE /shops/:key` write `shops.json` for TikTok shops (delete works for every local shop). A field of the other platform is rejected with `400 BAD_REQUEST`. Response shapes are unchanged.
- v1 + Shopee writes: `POST /shops` and `PUT /shops/:key` handle Shopee shops with a Seller Center cookie; `DELETE` drops a cookie no remaining shop uses. Cookie problems are `400 BAD_REQUEST` with a Vietnamese `detail`. Response shapes are unchanged.
- v1 + Vietnamese errors: every domain error and the `403` refusals carry a Vietnamese `detail` / `error.message`; codes are unchanged. Response shapes are unchanged.
- v1 + unreadable data files: a `shops.json` or `shopee_cookies.json` that cannot be read answers `500 SHOPS_FILE_UNREADABLE` / `500 COOKIES_FILE_UNREADABLE` with a Vietnamese `detail`, and the file is never overwritten. `PUT /shops/:key` documents `409 SHOP_ALREADY_EXISTS` (a rename onto a key another shop has). `PUT /settings/layout` rejects `null` for any field with `400 BAD_REQUEST`. Seller Center outages (5xx, 429, a 200 whose body is not JSON) are reported as unreachable instead of a rejected cookie; both stay `400 BAD_REQUEST`. Response shapes are unchanged.
- v1 + unreadable shops list: a `shops.json` whose `shops` value is present but not a list also answers `500 SHOPS_FILE_UNREADABLE` and is never overwritten; only a missing key or file reads as no shops. A Shopee `PUT` without `cookie` ignores `user_id: null` and keeps the stored user_id (Python tool behavior); clearing it needs a `cookie`. Response shapes are unchanged.
- v1 + Shopee link rules: a Shopee `live_url` must be an https address on `shopee.vn` or `shp.ee` (`400 BAD_REQUEST` otherwise, on `POST` and `PUT`; TikTok unchanged). A Shopee cookie value outside printable ASCII is `400 BAD_REQUEST` instead of being reported as an unreachable Seller Center. Routes that read `shops.json` list `500 SHOPS_FILE_UNREADABLE`, and `POST`/`PUT /shops` also list `500 COOKIES_FILE_UNREADABLE`, in the OpenAPI document. Response shapes are unchanged.
- v1 + backend login: `POST /backend/login` logs in to livestream-backend for real and refuses non-admin accounts with `400 BACKEND_LOGIN_FAILED`; `GET /backend/status` reports the masked backend and email; `POST /backend/logout` deletes the stored login; `POST /backend/sync` answers `400 BACKEND_NOT_CONNECTED` without a login. Response shapes are unchanged.
- v1 + backend sync: `GET /shops` and `GET /shops/:key` list the synced backend channels in place of the sample row, with today's schedules, `on_air_schedule_id` and `session`; `GET /backend/status` and `POST /backend/sync` report `synced_at`, `error`, `brands` and `schedules`; `POST /backend/login` syncs once before answering. Response shapes are unchanged.
- v1 + detection behaviour: documents the target job lifecycle, verdict rules, the reason code table, lifecycle rules, the wall tile rule and side-effect-free reads (Detection behaviour). `ShopRow` (so `ShopDetail`) and `DetectionState` gain a nullable `reason_code` (`ReasonCode` enum, always `null` for now). Regenerate the consumer types.
- v1 + stop by key: `POST /shops/:key/detection/stop` no longer reads shops and never answers `404 SHOP_NOT_FOUND` or `500 SHOPS_FILE_UNREADABLE`: it answers `stopped` for any key, so the job of a deleted channel can still be stopped. Response shapes are unchanged.
- v1 + persisted layout: `GET`/`PUT /settings/layout` read and write `mpv_layout.json` (Python-compatible keys, defaults and clamping). `PUT /settings/layout` documents `500 LAYOUT_FILE_UNREADABLE`; `GET` shows the defaults for an unreadable file. Regenerate the consumer types.
- v1 + error code enum: `error.code` is documented as the enum `ErrorCode` (the codes above plus the HTTP status names of 4xx and 5xx), so the admin can generate its error code type. Values are unchanged. Regenerate the consumer types.
- v1 + health product: `GET /health` answers `{product: "live-qc", status, version}`. `product` is new and constant, so the admin can tell this service from another program on port 8765. Regenerate the consumer types.
- v1 + cross-site guard: a request with `Sec-Fetch-Site: cross-site` and no allowed `Origin` is `403 ORIGIN_NOT_ALLOWED`, reads included. Response shapes are unchanged.
- v1 + operator wording: the Vietnamese `detail` texts say "kênh" instead of "shop", and a backend that is unreachable or has an invalid address no longer tells the operator to edit a `.env` file (it says to check the network, then contact the administrator). Codes and shapes are unchanged.
- v1 + review fixes: `reason_code` is the named schema `ReasonCode` (and gains `cookie_store_unreadable`); `POST /monitor/start` documents `keys: null` as every shop of the platforms (`keys` becomes nullable); the verdict rules, the resolve budget, the lifecycle and the deviations from Python are written out in Detection behaviour. Regenerate the consumer types.
- v1 + FFmpeg detection: `POST /shops/:key/detection/start|stop` and `GET /shops/:key/frame` are real with the FFmpeg detector. A job resolves, grabs a frame every 30 s while it plays, and writes the verdict, `reason_code`, `checked_at`, `live_since`, `attempts` and `frame_url` of its channel row. `message` is `null` in every state. Response shapes are unchanged.
- v1 + monitor: `GET /monitor`, `POST /monitor/start` and `POST /monitor/stop` are real: a supervisor keeps one job per selected channel (Monitor). `MonitorState.keys` comes sorted. Response shapes are unchanged.
- v1 + wall: `GET /wall` and `POST /wall/:key/refresh` are real, and `tiles` of `GET /settings/layout` and `GET /wall` follow the wall tile rule (running jobs only, live first). Response shapes are unchanged.
- v1 + mpv detection: the `mpv` detector (the default) is real, so jobs of the default settings show frames through a player started by the service. Response shapes are unchanged.
- v1 + show_mpv default: `show_mpv` defaults to `false` (a file that already holds the key keeps its value). Frames lost or a player that exits wait 3 s before the next attempt. Response shapes are unchanged.
- v1 + detection fixes: the tool of the selected detector is checked before every attempt; a stop waits at most 5 s; `restartActive` restarts jobs side by side and a stop during it wins; the monitor stops deselected jobs side by side. Response shapes are unchanged.
- v1 + sample layout geometry: the table now says that `screen`, `area`, `rows` and `columns` of `LayoutSnapshot` are sample values until the grid layout exists. The mpv first-frame wait ends at 20 s even while a pipe answer is pending. Response shapes are unchanged.
