import { Module } from '@nestjs/common';

import { DetectionModule } from '../detection';
import { DetectionStateModule } from '../detection-state';
import { ShopsModule } from '../shops';
import { MonitorController } from './controllers/monitor.controller';
import { MonitorService } from './services/monitor.service';
import { MonitorSupervisor } from './services/monitor-supervisor';

@Module({
  imports: [ShopsModule, DetectionModule, DetectionStateModule],
  controllers: [MonitorController],
  providers: [MonitorService, MonitorSupervisor],
})
export class MonitorModule {}
