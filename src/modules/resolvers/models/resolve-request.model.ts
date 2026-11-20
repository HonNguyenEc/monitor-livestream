import { Platform } from '../../../common/enums/platform.enum';

/** What a resolver needs from a channel: TikTok reads `username`, Shopee reads `cookie` plus `userId` or `liveUrl`. */
export interface ResolveRequest {
  key: string;
  platform: Platform;
  /** TikTok handle without the leading `@`. */
  username?: string;
  userId?: number;
  liveUrl?: string;
  /** livestream-backend brand id of a `source: backend` channel; its stream comes from the backend, whatever the platform. */
  brandId?: string;
  /** Seller Center cookie as the stored `SPC_SC_SESSION=<value>` pair; a bare value is prefixed. */
  cookie?: string;
  /** Limit of each HTTP request or yt-dlp run, not of the whole resolve; defaults to DEFAULT_RESOLVE_TIMEOUT_MS. */
  timeoutMs?: number;
}
