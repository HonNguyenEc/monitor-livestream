import { maskId } from '../../../common/utils/mask';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DEFAULT_SCHEDULE_PLATFORM } from '../../backend/constants/backend-sync.constants';
import { BackendBrand } from '../../backend/models/backend-brand.model';
import { BackendSchedule } from '../../backend/models/backend-schedule.model';
import { BackendSessionInfo } from '../../backend/models/backend-session-info.model';
import { BackendSyncStore } from '../../backend/services/backend-sync-store.service';
import { BRAND_ID_FIELD, PLATFORM_FIELD, ShopField } from '../constants/shop-fields.constants';
import { ScheduleDto } from '../dtos/schedule.dto';
import { SessionInfoDto } from '../dtos/session-info.dto';
import { StoredShop } from '../models/stored-shop.model';
import { BackendDetailParts } from './shop-view';
import { shopKey } from './shop-identity';

/** Position of a shop that is not an entry of shops.json. */
const NOT_IN_FILE = -1;

/** The channels synced from livestream-backend, as shops: Shopee only, in the order the backend listed them. */
export function backendShops(store: BackendSyncStore): StoredShop[] {
  return store.brands.map(toBackendShop);
}

function toBackendShop(brand: BackendBrand): StoredShop {
  const record = {
    [PLATFORM_FIELD]: Platform.SHOPEE,
    [BRAND_ID_FIELD]: brand.id,
    [ShopField.NAME]: brand.name,
  };
  return {
    key: shopKey(Platform.SHOPEE, record),
    platform: Platform.SHOPEE,
    source: ShopSource.BACKEND,
    record,
    index: NOT_IN_FILE,
  };
}

export function backendDetailParts(store: BackendSyncStore, shop: StoredShop): BackendDetailParts {
  const brandId = String(shop.record[BRAND_ID_FIELD]);
  const session = store.sessionOf(brandId);
  return {
    session: session && toSessionInfo(session),
    schedules: store.schedulesOf(brandId).map(toScheduleDto),
    onAirScheduleId: store.onAirSchedule(brandId)?.scheduleId ?? null,
  };
}

function toSessionInfo(session: BackendSessionInfo): SessionInfoDto {
  return {
    session_id: session.sessionId,
    shopee_status: session.shopeeStatus,
    is_live: session.isLive,
    title: session.title,
    share_url: session.shareUrl,
    expires_at: session.expiresAt,
    source: session.source,
    schedule_id: session.scheduleId,
    checked_at: session.checkedAt,
  };
}

// No account id; the session id is masked, as the page may show it.
function toScheduleDto(row: BackendSchedule): ScheduleDto {
  return {
    schedule_id: row.scheduleId,
    platform: schedulePlatform(row.platform),
    scheduled_at: row.scheduledAt,
    expected_end_at: row.expectedEndAt,
    status: row.status,
    status_label: row.statusLabel,
    schedule_status: row.scheduleStatus,
    session_id: maskId(row.sessionId),
  };
}

const PLATFORMS: readonly string[] = Object.values(Platform);

/** The backend's own value, or the platform it assumes when the row has none or one we do not monitor. */
function schedulePlatform(value: string | null): Platform {
  const platform = value?.toLowerCase() ?? '';
  return PLATFORMS.includes(platform) ? (platform as Platform) : DEFAULT_SCHEDULE_PLATFORM;
}
