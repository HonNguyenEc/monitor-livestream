import { Module } from '@nestjs/common';

import { MonitorController } from './controllers/monitor.controller';
import { MonitorService } from './services/monitor.service';

@Module({
  controllers: [MonitorController],
  providers: [MonitorService],
})
export class MonitorModule {}
