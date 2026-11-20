import { Platform } from '../../../common/enums/platform.enum';

export class ScheduleDto {
  schedule_id: string;
  platform: Platform;
  scheduled_at: string | null;
  expected_end_at: string | null;
  status: string | null;
  status_label: string | null;
  schedule_status: string | null;
  session_id: string;
}
