import {
  DEFAULT_SCHEDULE_PLATFORM,
  DEFAULT_SCHEDULE_RANK,
  SCHEDULE_GRACE_MS,
  SCHEDULE_LEAD_MS,
  SCHEDULE_STATUS_RANK,
  SKIPPED_SCHEDULE_STATUSES,
} from '../constants/backend-sync.constants';
import { BackendSchedule } from '../models/backend-schedule.model';
import { compareText } from './backend-answers';

function timeOf(value: string | null): number {
  return value === null ? Number.NaN : Date.parse(value);
}

function rank(row: BackendSchedule): number {
  return SCHEDULE_STATUS_RANK[row.scheduleStatus ?? ''] ?? DEFAULT_SCHEDULE_RANK;
}

/**
 * The Shopee schedules that may be live at `nowMs`, most likely first: by status, then latest start.
 * Several can overlap, e.g. a re-created live.
 */
export function onAirSchedules(rows: readonly BackendSchedule[], nowMs: number): BackendSchedule[] {
  return rows
    .filter((row) => {
      if ((row.platform || DEFAULT_SCHEDULE_PLATFORM) !== DEFAULT_SCHEDULE_PLATFORM) return false;
      if (SKIPPED_SCHEDULE_STATUSES.includes(row.scheduleStatus ?? '')) return false;
      const start = timeOf(row.scheduledAt);
      const end = timeOf(row.expectedEndAt);
      return start - SCHEDULE_LEAD_MS <= nowMs && nowMs <= end + SCHEDULE_GRACE_MS;
    })
    .sort((a, b) => compareText(b.scheduledAt ?? '', a.scheduledAt ?? ''))
    .sort((a, b) => rank(a) - rank(b));
}
