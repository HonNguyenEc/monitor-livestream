import { API_PREFIX, FRAME_ROUTE, SHOPS_ROUTE } from '../../../common/constants/app.constants';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DetectionSnapshot } from '../../detection-state';
import { ShopField } from '../constants/shop-fields.constants';
import { ScheduleDto } from '../dtos/schedule.dto';
import { SessionInfoDto } from '../dtos/session-info.dto';
import { ShopConfigDto } from '../dtos/shop-config.dto';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopRowDto } from '../dtos/shop-row.dto';
import { CookieStore, ShopRecord } from '../models/shop-record.model';
import { StoredShop } from '../models/stored-shop.model';
import { isPythonTruthy, pythonStr } from '../../../common/utils/python-values';
import { optionalInteger, optionalString } from './record-values';
import { shopLabel } from './shop-identity';

/** The row of a local or a backend channel, with the detection state of its job (idle without one). */
export function toShopRow(
  shop: StoredShop,
  cookies: CookieStore,
  detection: DetectionSnapshot,
): ShopRowDto {
  return {
    key: shop.key,
    platform: shop.platform,
    label: shopLabel(shop.record),
    source: shop.source,
    status: detection.status,
    job_state: detection.jobState,
    attempts: detection.attempts,
    message: detection.message,
    reason_code: detection.reasonCode,
    checked_at: detection.checkedAt,
    live_since: detection.liveSince,
    frame_url: frameUrl(shop.key, detection),
    cookie_set: shop.platform === Platform.SHOPEE && hasStoredCookie(shop.record, cookies),
  };
}

/** What a backend channel adds to its row; local channels have none. */
export interface BackendDetailParts {
  session: SessionInfoDto | null;
  schedules: ScheduleDto[];
  onAirScheduleId: string | null;
}

export function toShopDetail(
  shop: StoredShop,
  cookies: CookieStore,
  detection: DetectionSnapshot,
  backend?: BackendDetailParts,
): ShopDetailDto {
  return {
    ...toShopRow(shop, cookies, detection),
    config: toShopConfig(shop),
    session: backend?.session ?? null,
    schedules: backend?.schedules ?? [],
    on_air_schedule_id: backend?.onAirScheduleId ?? null,
  };
}

/** Versioned by the frame time, so a viewer reloads the image when a new frame lands. */
function frameUrl(key: string, detection: DetectionSnapshot): string | null {
  if (detection.framePath === null || detection.frameAtMs === null) return null;
  return `/${API_PREFIX}/${SHOPS_ROUTE}/${encodeURIComponent(key)}/${FRAME_ROUTE}?t=${detection.frameAtMs}`;
}

export function hasStoredCookie(record: ShopRecord, cookies: CookieStore): boolean {
  return (
    isPythonTruthy(record[ShopField.USER_ID]) &&
    isPythonTruthy(cookies[pythonStr(record[ShopField.USER_ID])])
  );
}

/** The editable fields of a local shop, platform and name of a backend one; unknown fields stay in shops.json but are not exposed. */
function toShopConfig({ platform, source, record }: StoredShop): ShopConfigDto {
  if (source === ShopSource.BACKEND) {
    return withoutUndefined({ platform, name: optionalString(record[ShopField.NAME]) });
  }
  return withoutUndefined({
    platform,
    username: optionalString(record[ShopField.USERNAME]),
    name: optionalString(record[ShopField.NAME]),
    user_id: optionalInteger(record[ShopField.USER_ID]),
    shop_id: optionalInteger(record[ShopField.SHOP_ID]),
    live_url: optionalString(record[ShopField.LIVE_URL]),
  });
}

function withoutUndefined(config: ShopConfigDto): ShopConfigDto {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as ShopConfigDto;
}
