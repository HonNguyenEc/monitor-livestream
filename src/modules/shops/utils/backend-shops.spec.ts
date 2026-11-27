import { Platform } from '../../../common/enums/platform.enum';
import { BackendSchedule } from '../../backend/models/backend-schedule.model';
import { BackendSyncStore } from '../../backend/services/backend-sync-store.service';
import { backendDetailParts, backendShops } from './backend-shops';

const BRAND = 'b1';
const row = (platform: string | null): BackendSchedule => ({
  scheduleId: 's1',
  platform,
  sessionId: '123456789',
  scheduledAt: null,
  expectedEndAt: null,
  status: null,
  statusLabel: null,
  scheduleStatus: null,
});

describe('backendDetailParts', () => {
  const platformOf = (platform: string | null): Platform => {
    const store = new BackendSyncStore({ connected: true } as never);
    store.setBrands([{ id: BRAND, name: 'One' }]);
    store.setBoard(new Map([[BRAND, [row(platform)]]]));
    return backendDetailParts(store, backendShops(store)[0]).schedules[0].platform;
  };

  it.each([
    ['shopee', Platform.SHOPEE],
    ['TikTok', Platform.TIKTOK],
    [null, Platform.SHOPEE],
    ['', Platform.SHOPEE],
    ['lazada', Platform.SHOPEE],
  ])('reports the schedule platform %p as %s', (value, expected) => {
    expect(platformOf(value)).toBe(expected);
  });
});
