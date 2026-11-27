import { Module } from '@nestjs/common';

import { DetectionStateModule } from '../detection-state';
import { DetectionModule } from '../detection';
import { SettingsModule } from '../settings';
import { ShopsModule } from '../shops';
import { LayoutController } from './controllers/layout.controller';
import { LayoutService } from './services/layout.service';

@Module({
  imports: [ShopsModule, DetectionStateModule, SettingsModule, DetectionModule],
  controllers: [LayoutController],
  providers: [LayoutService],
  exports: [LayoutService],
})
export class LayoutModule {}
