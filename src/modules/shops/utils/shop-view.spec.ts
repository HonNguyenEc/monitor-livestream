import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { IDLE_DETECTION } from '../../detection-state/models/detection-snapshot.model';
import { StoredShop } from '../models/stored-shop.model';
import { toShopRow } from './shop-view';

const SHOP: StoredShop = {
  key: 'tiktok_a',
  platform: Platform.TIKTOK,
  source: ShopSource.LOCAL,
  record: { platform: 'tiktok', username: 'a' },
  index: 0,
};

describe('toShopRow', () => {
  it('reports the idle state for a channel without a job', () => {
    expect(toShopRow(SHOP, {}, IDLE_DETECTION)).toMatchObject({
      status: LiveStatus.NOT_CHECKED,
      job_state: JobState.STOPPED,
      attempts: 0,
      message: null,
      reason_code: null,
      checked_at: null,
      live_since: null,
      frame_url: null,
    });
  });

  it('reports the detection state of a running job', () => {
    const row = toShopRow(
      SHOP,
      {},
      {
        status: LiveStatus.OFFLINE,
        jobState: JobState.RETRYING,
        attempts: 3,
        reasonCode: ReasonCode.NOT_LIVE,
        message: 'waiting',
        checkedAt: '2026-01-01T00:00:00Z',
        liveSince: null,
        framePath: 'C:\\frames\\a.jpg',
        frameAtMs: 1234,
      },
    );

    expect(row).toMatchObject({
      status: 'offline',
      job_state: 'retrying',
      attempts: 3,
      reason_code: 'not_live',
      message: 'waiting',
      checked_at: '2026-01-01T00:00:00Z',
      frame_url: '/api/v1/shops/tiktok_a/frame?t=1234',
    });
  });

  it('has no frame url while the frame time is unknown', () => {
    const row = toShopRow(SHOP, {}, { ...IDLE_DETECTION, framePath: 'x.jpg' });

    expect(row.frame_url).toBeNull();
  });
});
