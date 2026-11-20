import { API_PREFIX } from '../../../common/constants/app.constants';
import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopRowDto } from '../dtos/shop-row.dto';

const TIKTOK_KEY = 'tiktok_sample_shop';
const TIKTOK_USERNAME = 'sample_shop';
const BRAND_NAME = 'Sample Brand';
const CHECKED_AT = '2026-01-01T08:00:00+00:00';
const SCHEDULE_ID = 'sch-1';
const SESSION_ID = '•••6215';

export const SAMPLE_TIKTOK_ROW: ShopRowDto = {
  key: TIKTOK_KEY,
  platform: Platform.TIKTOK,
  label: TIKTOK_USERNAME,
  source: ShopSource.LOCAL,
  status: LiveStatus.LIVE,
  job_state: JobState.PLAYING,
  attempts: 1,
  message: 'Live, frames received.',
  checked_at: CHECKED_AT,
  live_since: '2026-01-01T07:55:00+00:00',
  frame_url: `/${API_PREFIX}/shops/${TIKTOK_KEY}/frame?t=1767254400000`,
  cookie_set: false,
};

export const SAMPLE_BACKEND_ROW: ShopRowDto = {
  key: 'shopee_api_0123456789',
  platform: Platform.SHOPEE,
  label: BRAND_NAME,
  source: ShopSource.BACKEND,
  status: LiveStatus.OFFLINE,
  job_state: JobState.RETRYING,
  attempts: 3,
  message: 'Not live; will open the player when the shop goes live.',
  checked_at: CHECKED_AT,
  live_since: null,
  frame_url: null,
  cookie_set: false,
};

export const SAMPLE_ROWS: ShopRowDto[] = [SAMPLE_TIKTOK_ROW, SAMPLE_BACKEND_ROW];

export const SAMPLE_TIKTOK_DETAIL: ShopDetailDto = {
  ...SAMPLE_TIKTOK_ROW,
  config: { platform: Platform.TIKTOK, username: TIKTOK_USERNAME },
  session: null,
  schedules: [],
  on_air_schedule_id: null,
};

export const SAMPLE_BACKEND_DETAIL: ShopDetailDto = {
  ...SAMPLE_BACKEND_ROW,
  config: { platform: Platform.SHOPEE, name: BRAND_NAME },
  session: {
    session_id: SESSION_ID,
    shopee_status: 0,
    is_live: false,
    title: 'Sample live',
    share_url: null,
    expires_at: null,
    source: 'schedule',
    schedule_id: SCHEDULE_ID,
    checked_at: CHECKED_AT,
  },
  schedules: [
    {
      schedule_id: SCHEDULE_ID,
      platform: Platform.SHOPEE,
      scheduled_at: '2026-01-01T09:00:00+07:00',
      expected_end_at: '2026-01-01T11:00:00+07:00',
      status: 'waiting',
      status_label: 'Waiting',
      schedule_status: 'scheduled',
      session_id: SESSION_ID,
    },
  ],
  on_air_schedule_id: SCHEDULE_ID,
};

export const SAMPLE_DETAILS: ShopDetailDto[] = [SAMPLE_TIKTOK_DETAIL, SAMPLE_BACKEND_DETAIL];
