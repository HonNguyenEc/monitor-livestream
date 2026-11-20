import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopRowDto } from '../dtos/shop-row.dto';

const BRAND_NAME = 'Sample Brand';
const CHECKED_AT = '2026-01-01T08:00:00+00:00';
const SCHEDULE_ID = 'sch-1';
const SESSION_ID = '•••6215';

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

export const SAMPLE_BACKEND_ROWS: ShopRowDto[] = [SAMPLE_BACKEND_ROW];

const SAMPLE_BACKEND_DETAIL: ShopDetailDto = {
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

export const SAMPLE_BACKEND_DETAILS: ShopDetailDto[] = [SAMPLE_BACKEND_DETAIL];
