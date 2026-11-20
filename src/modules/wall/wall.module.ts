import { Module } from '@nestjs/common';

import { DetectionModule } from '../detection';
import { LayoutModule } from '../layout';
import { ShopsModule } from '../shops';
import { WallController } from './controllers/wall.controller';
import { WallService } from './services/wall.service';

@Module({
  imports: [ShopsModule, LayoutModule, DetectionModule],
  controllers: [WallController],
  providers: [WallService],
})
export class WallModule {}
