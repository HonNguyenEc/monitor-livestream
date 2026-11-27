import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';

/** A monitorable channel, local or synced from the backend; what other modules read instead of shop rows. */
export interface Channel {
  key: string;
  platform: Platform;
  source: ShopSource;
  label: string;
  /** TikTok handle as stored. */
  username?: string;
  userId?: number;
  liveUrl?: string;
  /** livestream-backend brand id of a `source: backend` channel. */
  brandId?: string;
}
