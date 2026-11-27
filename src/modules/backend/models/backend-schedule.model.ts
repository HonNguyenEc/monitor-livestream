/** The fields of a /live-monitor/board row the QC tool uses. */
export interface BackendSchedule {
  scheduleId: string;
  platform: string | null;
  sessionId: string;
  scheduledAt: string | null;
  expectedEndAt: string | null;
  status: string | null;
  statusLabel: string | null;
  scheduleStatus: string | null;
}
