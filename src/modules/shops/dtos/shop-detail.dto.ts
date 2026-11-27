import { ScheduleDto } from './schedule.dto';
import { SessionInfoDto } from './session-info.dto';
import { ShopConfigDto } from './shop-config.dto';
import { ShopRowDto } from './shop-row.dto';

export class ShopDetailDto extends ShopRowDto {
  config: ShopConfigDto | null;
  session: SessionInfoDto | null;
  schedules: ScheduleDto[];
  on_air_schedule_id: string | null;
}
