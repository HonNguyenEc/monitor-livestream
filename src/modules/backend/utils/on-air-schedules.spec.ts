import { BackendSchedule } from '../models/backend-schedule.model';
import { onAirSchedules } from './on-air-schedules';

const MINUTE = 60_000;
const START = Date.parse('2026-01-15T10:00:00+07:00');
const END = Date.parse('2026-01-15T12:00:00+07:00');

function schedule(overrides: Partial<BackendSchedule> = {}): BackendSchedule {
  return {
    scheduleId: 's',
    platform: 'shopee',
    sessionId: '1',
    scheduledAt: '2026-01-15T10:00:00+07:00',
    expectedEndAt: '2026-01-15T12:00:00+07:00',
    status: 'waiting',
    statusLabel: null,
    scheduleStatus: 'scheduled',
    ...overrides,
  };
}

describe('onAirSchedules', () => {
  it.each([
    ['16 min before the start', START - 16 * MINUTE, false],
    ['15 min before the start', START - 15 * MINUTE, true],
    ['at the planned end', END, true],
    ['30 min after the planned end', END + 30 * MINUTE, true],
    ['31 min after the planned end', END + 31 * MINUTE, false],
  ])('%s', (_case, now, expected) => {
    expect(onAirSchedules([schedule()], now)).toHaveLength(expected ? 1 : 0);
  });

  it('skips cancelled and failed schedules, other platforms and rows without usable times', () => {
    const rows = [
      schedule({ scheduleId: 'a', scheduleStatus: 'cancelled' }),
      schedule({ scheduleId: 'b', scheduleStatus: 'failed' }),
      schedule({ scheduleId: 'c', platform: 'tiktok' }),
      schedule({ scheduleId: 'd', scheduledAt: null }),
      schedule({ scheduleId: 'e', expectedEndAt: 'not a date' }),
      schedule({ scheduleId: 'f', platform: null }),
    ];

    expect(onAirSchedules(rows, START).map((row) => row.scheduleId)).toEqual(['f']);
  });

  it('ranks live first, then others by latest start, finished ones last', () => {
    const rows = [
      schedule({
        scheduleId: 'done',
        scheduleStatus: 'completed',
        scheduledAt: '2026-01-15T11:00:00+07:00',
      }),
      schedule({ scheduleId: 'old', scheduledAt: '2026-01-15T09:00:00+07:00' }),
      schedule({ scheduleId: 'new', scheduledAt: '2026-01-15T10:30:00+07:00' }),
      schedule({
        scheduleId: 'live',
        scheduleStatus: 'live',
        scheduledAt: '2026-01-15T08:00:00+07:00',
      }),
      schedule({
        scheduleId: 'ended',
        scheduleStatus: 'ended',
        scheduledAt: '2026-01-15T11:30:00+07:00',
      }),
    ];

    expect(onAirSchedules(rows, START + 90 * MINUTE).map((row) => row.scheduleId)).toEqual([
      'live',
      'new',
      'old',
      'ended',
      'done',
    ]);
  });
});
