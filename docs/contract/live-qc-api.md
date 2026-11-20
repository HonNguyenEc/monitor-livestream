# Live QC API contract (v1)

|                 |                                                                        |
| --------------- | ---------------------------------------------------------------------- |
| Provider        | `monitor-livestream` (this repo, NestJS service)                       |
| Consumer        | `livestream-admin` (Live QC pages)                                     |
| Source of truth | this document + `docs/openapi/live-qc.json`                            |
| Change rule     | shape changes land here first, then in code; never the other way round |

## Implementation status

Every endpoint below exists. **Until a row says `real`, it returns fixed sample data** with the documented shape, so the frontend can build against it now. The status column is updated in the same commit that makes an endpoint real.

`real (backend)` means the backend login and sync are real. The login is stored in `backend_session.json` and refreshed when the backend answers 401. Once logged in, the service reads `/brands` (every 10 minutes) and today's `/live-monitor/board` (every 2 minutes, and when the local date changes) from livestream-backend, and `POST /backend/sync` reads both now. Without a login the service makes no backend call and lists no backend channel. After a failed read the last good lists stay, `error` carries the masked reason and the next try waits 60 s, doubling to at most 600 s (the backend's `Retry-After` replaces the 60 s when sent, still capped at 600 s; a `Retry-After` of 0 is ignored). A logout, a login that ends, or a new login clears everything synced. A `POST /backend/sync` or login that arrives while a full sync of the same login is running shares its result instead of reading again. The login email is trimmed before it is checked.

`real (local)` means local channels come from the service's own `shops.json`. Until detection is real, every local row reports `status: "not_checked"`, `job_state: "stopped"`, `attempts: 0` and null `message`, `checked_at`, `live_since` and `frame_url`. Backend channels (`source: "backend"`) are the connected Shopee Open API brands that the logged-in account can see (livestream-backend scopes `/brands`); they report the same idle detection fields. Their `key` is `shopee_api_<first 10 hex of sha1(brand id)>` and their `label` is the brand name. `GET /shops/:key` of a backend channel adds today's `schedules` (session ids masked, no account id), `on_air_schedule_id` (the schedule whose session was last found live, else the likeliest one from 15 minutes before its start to 30 minutes after its planned end) and `session` (what the last play URL lookup answered, `null` until one ran; it never holds the URL).

## Basics

- **Base URL:** `http://127.0.0.1:<QC_PORT>/api/v1` (default port 8765; `localhost` works too). The service runs on the operator's own machine, installed from a Windows installer, so the admin app uses `http://127.0.0.1:8765` as its default in code; `VITE_LIVE_QC_URL` in a local `.env` only overrides it.
- **Auth:** none. Do not send the admin `Authorization` header. Any logged-in admin user may call the service on their own machine. Brand access is enforced by livestream-backend through the account the operator logs the service in with (`POST /backend/login`, admin accounts only).
- **CORS:** only origins in the service's `ALLOWED_ORIGINS` (dev default `http://localhost:3004`).
- **Local-only requests:** the `Host` header must name `127.0.0.1`, `localhost` or `[::1]` (any port, any letter case), otherwise `403 HOST_NOT_ALLOWED`. A write (anything but GET/HEAD/OPTIONS) whose `Origin` header is neither in `ALLOWED_ORIGINS` nor the service's own origin (Swagger UI at `/docs`) gets `403 ORIGIN_NOT_ALLOWED`. `ALLOWED_ORIGINS` lists the pages that call the service, such as the admin dev server, not the service's own address. A dev proxy that keeps the browser `Host` and `Origin` passes both checks. **A proxy must not rewrite `Host` to a loopback name** (e.g. Vite `changeOrigin: true`): that lets any host the proxy serves, such as a public tunnel, reach the service.
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
  "detail": "Không tìm thấy shop x.",
  "error": { "code": "SHOP_NOT_FOUND", "message": "Không tìm thấy shop x.", "request_id": "uuid" }
}
```

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
| `SHOPS_FILE_UNREADABLE`                 | 500      | `shops.json` is locked, not valid JSON, or its `shops` value is not a list; every route that reads shops lists it (`/shops*`, `detection/start`, `detection/stop`, `frame`, `/settings/layout`, `/wall*`), and nothing is overwritten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `COOKIES_FILE_UNREADABLE`               | 500      | `shopee_cookies.json` is locked or not valid JSON; `POST`/`PUT /shops` for a Shopee shop refuse to write (nothing is overwritten) and list it, while reads show `cookie_set: false` and `DELETE` still succeeds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `HOST_NOT_ALLOWED`                      | 403      | The `Host` header is not a loopback name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ORIGIN_NOT_ALLOWED`                    | 403      | A write came from an origin outside `ALLOWED_ORIGINS`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `BAD_REQUEST`                           | 400      | The request body failed validation: a wrong type, a value outside an enum, a missing required field, or a field the endpoint does not accept. `detail` lists every problem, joined with `, `. Also a value only the service can check, with one Vietnamese message in `detail`: a field the shop's platform does not use, a TikTok username that is only `@`, a Shopee `live_url` that is not an https `shopee.vn` / `shp.ee` address, a Shopee cookie without `SPC_SC_SESSION` or whose value has characters outside printable ASCII (`detail` never repeats the value), one Seller Center rejects (`detail` says the cookie was refused) or cannot check right now (`detail` says Seller Center is unreachable: network failure, timeout, 5xx, 429 or a 200 whose body is not JSON), or a Shopee edit that the stored cookie cannot cover |
| `NOT_FOUND`, `INTERNAL_SERVER_ERROR`, … | as named | Other generic errors use the HTTP status name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Enums

| Enum        | Values                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`  | `tiktok`, `shopee`                                                                                                                                                                  |
| `source`    | `local` (stored in this service), `backend` (Shopee Open API brand synced from livestream-backend)                                                                                  |
| `status`    | `live`, `offline` (platform says not live), `unknown` (could not tell), `no_signal` (stream opened but no frames), `checking` (job running, no verdict yet), `not_checked` (no job) |
| `job_state` | `stopped`, `retrying`, `checking_image`, `playing`, `stopping`, `error`                                                                                                             |
| `detector`  | `mpv`, `ffmpeg`                                                                                                                                                                     |
| `aspect`    | `9:16`, `16:9`, `3:4`, `1:1`                                                                                                                                                        |

## Endpoints

| Method & path                      | Request                                    | Response                                                                                                                                     | Status                                                                |
| ---------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /health`                      | —                                          | `{status: "ok", version}`                                                                                                                    | real                                                                  |
| `GET /shops`                       | —                                          | `{items: ShopRow[]}`: local channels in `shops.json` order, then backend channels                                                            | real (local + backend)                                                |
| `GET /shops/:key`                  | —                                          | `ShopDetail`                                                                                                                                 | real (local + backend)                                                |
| `POST /shops`                      | `CreateShop`                               | `201 ShopDetail`                                                                                                                             | real                                                                  |
| `PUT /shops/:key`                  | `UpdateShop`                               | `ShopDetail`, under the shop's new key when the change renames it                                                                            | real                                                                  |
| `DELETE /shops/:key`               | —                                          | `204`                                                                                                                                        | real                                                                  |
| `POST /shops/:key/detection/start` | —                                          | `DetectionState`                                                                                                                             | stub                                                                  |
| `POST /shops/:key/detection/stop`  | —                                          | `DetectionState`                                                                                                                             | stub                                                                  |
| `GET /shops/:key/frame`            | —                                          | `image/jpeg`, or `404 FRAME_NOT_FOUND` while no frame exists                                                                                 | stub                                                                  |
| `GET /monitor`                     | —                                          | `MonitorState`                                                                                                                               | stub                                                                  |
| `POST /monitor/start`              | `{platforms: platform[], keys?: string[]}` | `MonitorState`                                                                                                                               | stub                                                                  |
| `POST /monitor/stop`               | —                                          | `MonitorState`                                                                                                                               | stub                                                                  |
| `GET /backend/status`              | —                                          | `BackendStatus`                                                                                                                              | real (backend)                                                        |
| `POST /backend/login`              | `{email, password}`                        | `BackendStatus` (after a first sync, whose failure shows in `error`), or `400 BACKEND_LOGIN_FAILED`                                          | real (backend)                                                        |
| `POST /backend/logout`             | —                                          | `BackendStatus`                                                                                                                              | real (backend)                                                        |
| `POST /backend/sync`               | —                                          | `BackendStatus` after reading brands and board now (a failed read is `200` with `error` set), or `400 BACKEND_NOT_CONNECTED` without a login | real (backend)                                                        |
| `GET /settings/layout`             | —                                          | `LayoutSnapshot`                                                                                                                             | stub (settings are sample values; `tiles` come from the local shops)  |
| `PUT /settings/layout`             | partial `LayoutSettings`                   | `LayoutSnapshot`                                                                                                                             | stub (settings are kept in memory; `tiles` come from the local shops) |
| `GET /wall`                        | —                                          | `Wall`                                                                                                                                       | stub                                                                  |
| `POST /wall/:key/refresh`          | —                                          | `{url}` or `502 STREAM_UNAVAILABLE`                                                                                                          | stub                                                                  |

Request bodies are validated even while an endpoint is a stub. A field the request shape does not list is rejected with `400 BAD_REQUEST`.

### Shapes

```ts
ShopRow = {
  key: string; platform: Platform; label: string; source: 'local' | 'backend';
  status: Status; job_state: JobState; attempts: number; message: string | null;
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

DetectionState = { key: string; state: JobState; message: string | null }
MonitorState = { running: boolean; platforms: Platform[]; keys: string[] | null }
// platforms: what POST /monitor/start selected, [] while stopped. keys: null = every shop of those platforms.
// A start without keys monitors every shop of its platforms, even when an earlier start listed keys.

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
LayoutSnapshot = { settings: LayoutSettings; screen: Area; area: Area; aspects: Aspect[];
                   detectors: Detector[]; rows; columns; tiles: { key; label; live; visible }[] }

Wall = { settings: { rows; columns; gap; aspect; live_only }; detector: Detector;
         tiles: { key; label; live; visible; url: string | null }[] }  // url: signed HTTP-FLV, expires
```

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
- an install/update banner on every Live QC page: `GET /health` failing means the service is not running (show the installer download link); `version` below the admin's minimum service version means it must be updated
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
