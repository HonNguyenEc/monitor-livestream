import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { ShopConfigDto } from '../dtos/shop-config.dto';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopRowDto } from '../dtos/shop-row.dto';
import { CookieStore, ShopRecord } from '../models/shop-record.model';
import { StoredShop } from '../models/stored-shop.model';
import { isPythonTruthy, pythonStr } from './python-values';
import { optionalInteger, optionalString } from './record-values';
import { shopLabel } from './shop-identity';

/** A row without detection state; detection jobs arrive in Phase 4. */
export function toShopRow(shop: StoredShop, cookies: CookieStore): ShopRowDto {
  return {
    key: shop.key,
    platform: shop.platform,
    label: shopLabel(shop.record),
    source: shop.source,
    status: LiveStatus.NOT_CHECKED,
    job_state: JobState.STOPPED,
    attempts: 0,
    message: null,
    checked_at: null,
    live_since: null,
    frame_url: null,
    cookie_set: shop.platform === Platform.SHOPEE && hasStoredCookie(shop.record, cookies),
  };
}

export function toShopDetail(shop: StoredShop, cookies: CookieStore): ShopDetailDto {
  return {
    ...toShopRow(shop, cookies),
    config: toShopConfig(shop),
    session: null,
    schedules: [],
    on_air_schedule_id: null,
  };
}

export function hasStoredCookie(record: ShopRecord, cookies: CookieStore): boolean {
  return isPythonTruthy(record.user_id) && isPythonTruthy(cookies[pythonStr(record.user_id)]);
}

/** The editable fields only; unknown fields stay in shops.json but are not exposed. */
function toShopConfig({ platform, source, record }: StoredShop): ShopConfigDto {
  if (source === ShopSource.BACKEND) {
    return withoutUndefined({ platform, name: optionalString(record.name) });
  }
  return withoutUndefined({
    platform,
    username: optionalString(record.username),
    name: optionalString(record.name),
    user_id: optionalInteger(record.user_id),
    shop_id: optionalInteger(record.shop_id),
    live_url: optionalString(record.live_url),
  });
}

function withoutUndefined(config: ShopConfigDto): ShopConfigDto {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as ShopConfigDto;
}
