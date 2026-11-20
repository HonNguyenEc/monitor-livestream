# Live QC API contract (v1)

| | |
|---|---|
| Provider | `monitor-livestream` (this repo, NestJS service) |
| Consumer | `livestream-admin` (Live QC pages) |
| Source of truth | this document + `docs/openapi/live-qc.json` |
| Change rule | shape changes land here first, then in code; never the other way round |

## Implementation status

Every endpoint below exists. **Until a row says `real`, it returns fixed sample data** with the documented shape, so the frontend can build against it now. The status column is updated in the same commit that makes an endpoint real.

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
{ "detail": "Shop x not found", "error": { "code": "SHOP_NOT_FOUND", "message": "Shop x not found", "request_id": "uuid" } }
```

| `error.code` | HTTP | Meaning |
|---|---|---|
| `SHOP_NOT_FOUND` | 404 | Unknown shop key |
| `SHOP_ALREADY_EXISTS` | 409 | A shop with the resulting key already exists |
| `BACKEND_SHOP_READ_ONLY` | 409 | Shops synced from livestream-backend cannot be edited or deleted here |
| `FRAME_NOT_FOUND` | 404 | No frame captured yet for this shop |
| `NO_PLATFORM_SELECTED` | 400 | `POST /monitor/start` without platforms |
| `BACKEND_NOT_CONNECTED` | 400 | The service has no backend login |
| `BACKEND_LOGIN_FAILED` | 400 | Wrong credentials, or the account is not admin/super_admin |
| `STREAM_UNAVAILABLE` | 502 | A fresh stream URL could not be resolved |
| `HOST_NOT_ALLOWED` | 403 | The `Host` header is not a loopback name |
| `ORIGIN_NOT_ALLOWED` | 403 | A write came from an origin outside `ALLOWED_ORIGINS` |
| `BAD_REQUEST` | 400 | The request body failed validation: a wrong type, a value outside an enum, a missing required field, or a field the endpoint does not accept. `detail` lists every problem, joined with `, ` |
| `NOT_FOUND`, `INTERNAL_SERVER_ERROR`, … | as named | Other generic errors use the HTTP status name |

## Enums

| Enum | Values |
|---|---|
| `platform` | `tiktok`, `shopee` |
| `source` | `local` (stored in this service), `backend` (Shopee Open API brand synced from livestream-backend) |
| `status` | `live`, `offline` (platform says not live), `unknown` (could not tell), `no_signal` (stream opened but no frames), `checking` (job running, no verdict yet), `not_checked` (no job) |
| `job_state` | `stopped`, `retrying`, `checking_image`, `playing`, `stopping`, `error` |
| `detector` | `mpv`, `ffmpeg` |
| `aspect` | `9:16`, `16:9`, `3:4`, `1:1` |

## Endpoints

| Method & path | Request | Response | Status |
|---|---|---|---|
| `GET /health` | — | `{status: "ok", version}` | real |
| `GET /shops` | — | `{items: ShopRow[]}` | stub |
| `GET /shops/:key` | — | `ShopDetail` | stub |
| `POST /shops` | `CreateShop` | `201 ShopDetail` | stub |
| `PUT /shops/:key` | `UpdateShop` | `ShopDetail` | stub |
| `DELETE /shops/:key` | — | `204` | stub |
| `POST /shops/:key/detection/start` | — | `DetectionState` | stub |
| `POST /shops/:key/detection/stop` | — | `DetectionState` | stub |
| `GET /shops/:key/frame` | — | `image/jpeg`, or `404 FRAME_NOT_FOUND` while no frame exists | stub |
| `GET /monitor` | — | `MonitorState` | stub |
| `POST /monitor/start` | `{platforms: platform[], keys?: string[]}` | `MonitorState` | stub |
| `POST /monitor/stop` | — | `MonitorState` | stub |
| `GET /backend/status` | — | `BackendStatus` | stub |
| `POST /backend/login` | `{email, password}` | `BackendStatus` | stub |
| `POST /backend/logout` | — | `BackendStatus` | stub |
| `POST /backend/sync` | — | `BackendStatus` | stub |
| `GET /settings/layout` | — | `LayoutSnapshot` | stub |
| `PUT /settings/layout` | partial `LayoutSettings` | `LayoutSnapshot` | stub |
| `GET /wall` | — | `Wall` | stub |
| `POST /wall/:key/refresh` | — | `{url}` or `502 STREAM_UNAVAILABLE` | stub |

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
UpdateShop = CreateShop without platform; omit cookie to keep the stored one.

DetectionState = { key: string; state: JobState; message: string | null }
MonitorState = { running: boolean; platforms: Platform[]; keys: string[] | null }
// platforms: what POST /monitor/start selected, [] while stopped. keys: null = every shop of those platforms.
// A start without keys monitors every shop of its platforms, even when an earlier start listed keys.

BackendStatus = { connected; backend /* masked host */; email /* masked */; name; role;
                  synced_at: string | null; error: string | null; brands: number; schedules: number;
                  api_calls_5m: number }

LayoutSettings = { enabled; x; y; width; height /* 0,0 = full work area */; rows; columns /* 0 = auto */;
                   gap; aspect: Aspect; live_only; ontop; detector: Detector; show_mpv }
LayoutSnapshot = { settings: LayoutSettings; screen: Area; area: Area; aspects: Aspect[];
                   detectors: Detector[]; rows; columns; tiles: { key; label; live; visible }[] }

Wall = { settings: { rows; columns; gap; aspect; live_only }; detector: Detector;
         tiles: { key; label; live; visible; url: string | null }[] }  // url: signed HTTP-FLV, expires
```

## Pages and the APIs they need (consumer side)

All pages sit in a `live-qc` nav group, each on its own route. Each page polls only what it shows, every 5 s unless noted.

| Page (route) | Shows | APIs |
|---|---|---|
| Channels `/dashboard/live-qc/channels` | shop list, filters (platform, status, search), start/stop monitoring for all or ticked shops | `GET /shops`, `GET /monitor`, `POST /monitor/start`, `POST /monitor/stop` |
| Channel detail `/dashboard/live-qc/channels/:key` | tabs: overview (status, frame, start/stop detection), session & schedules, config (edit/delete) | `GET /shops/:key`, `GET /shops/:key/frame`, `POST /shops/:key/detection/start\|stop`, `PUT /shops/:key`, `DELETE /shops/:key` |
| Add channel `/dashboard/live-qc/channels/new` | form for a TikTok username or a Shopee cookie shop | `POST /shops` |
| Live wall `/dashboard/live-qc/wall` | grid of live streams played with `mpegts.js` (FLV), sound on one tile at a time | `GET /wall`; on a player error or a 15 s stall, `POST /wall/:key/refresh` with backoff |
| Settings `/dashboard/live-qc/settings` | detector (mpv/ffmpeg), mpv window grid and position, live-only, preview | `GET /settings/layout`, `PUT /settings/layout` |
| Backend connection `/dashboard/live-qc/connection` | the service's own admin login to livestream-backend, sync button | `GET /backend/status`, `POST /backend/login\|logout\|sync` |

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
