import { Module } from '@nestjs/common';

import { DetectionStateModule } from '../detection-state';
import { PlayersModule } from '../players';
import { ResolversModule } from '../resolvers';
import { SettingsModule } from '../settings';
import { ShopsModule } from '../shops';
import { DetectionController } from './controllers/detection.controller';
import { DetectionService } from './services/detection.service';

@Module({
  imports: [ShopsModule, DetectionStateModule, SettingsModule, ResolversModule, PlayersModule],
  controllers: [DetectionController],
  providers: [DetectionService],
  exports: [DetectionService],
})
export class DetectionModule {}
