import { Module } from '@nestjs/common';

import { ShopsModule } from '../shops/shops.module';
import { DetectionController } from './controllers/detection.controller';
import { DetectionService } from './services/detection.service';

@Module({
  imports: [ShopsModule],
  controllers: [DetectionController],
  providers: [DetectionService],
})
export class DetectionModule {}
