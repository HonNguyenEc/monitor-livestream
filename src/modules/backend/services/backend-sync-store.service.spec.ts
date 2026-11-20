import { BackendSchedule } from '../models/backend-schedule.model';
import { BackendSessionInfo } from '../models/backend-session-info.model';
import { BackendSessionService } from './backend-session.service';
import { BackendSyncStore } from './backend-sync-store.service';

const NOW = Date.parse('2026-01-15T10:30:00+07:00');

function row(scheduleId: string, scheduledAt: string): BackendSchedule {
  return {
    scheduleId,
    platform: 'shopee',
    sessionId: scheduleId,
    scheduledAt,
    expectedEndAt: '2026-01-15T12:00:00+07:00',
    status: null,
    statusLabel: null,
    scheduleStatus: 'scheduled',
  };
}

function info(scheduleId: string | null): BackendSessionInfo {
  return {
    sessionId: '•••1234',
    shopeeStatus: 1,
    isLive: true,
    title: null,
    shareUrl: null,
    expiresAt: null,
    source: 'x',
    scheduleId,
    checkedAt: 'now',
  };
}

describe('BackendSyncStore', () => {
  let session: { connected: boolean };
  let store: BackendSyncStore;

  beforeEach(() => {
    session = { connected: true };
    store = new BackendSyncStore(session as BackendSessionService);
    store.setBoard(
      new Map([
        [
          'b1',
          [row('early', '2026-01-15T10:00:00+07:00'), row('late', '2026-01-15T10:20:00+07:00')],
        ],
      ]),
    );
  });

  it('prefers the on-air schedule whose session was last found live', () => {
    expect(store.onAirSchedule('b1', NOW)?.scheduleId).toBe('late');

    store.setSession('b1', info('early'));

    expect(store.onAirSchedule('b1', NOW)?.scheduleId).toBe('early');
  });

  it('has no on-air schedule outside the window or for another brand', () => {
    expect(store.onAirSchedule('b1', NOW + 24 * 3600_000)).toBeNull();
    expect(store.onAirSchedule('other', NOW)).toBeNull();
  });

  it('counts brands and schedules', () => {
    store.setBrands([{ id: 'b1', name: 'One' }]);

    expect(store.status).toMatchObject({ brands: 1, schedules: 2 });
  });

  it('keeps the error after the login ended, with no counts', () => {
    store.setBrands([{ id: 'b1', name: 'One' }]);
    store.setError('why');

    session.connected = false;

    expect(store.status).toEqual({ syncedAt: null, error: 'why', brands: 0, schedules: 0 });
    expect(store.sessionOf('b1')).toBeNull();
  });

  it('forgets everything on clear and bumps the generation', () => {
    store.setBrands([{ id: 'b1', name: 'One' }]);
    store.setSession('b1', info(null));
    const before = store.generation;

    store.clear();

    expect(store.generation).toBe(before + 1);
    expect(store.brands).toEqual([]);
    expect(store.schedulesOf('b1')).toEqual([]);
    expect(store.sessionOf('b1')).toBeNull();
  });
});
