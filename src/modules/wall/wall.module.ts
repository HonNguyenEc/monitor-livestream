import { Module } from '@nestjs/common';

import { LayoutModule } from '../layout/layout.module';
import { ShopsModule } from '../shops/shops.module';
import { WallController } from './controllers/wall.controller';
import { WallService } from './services/wall.service';

@Module({
  imports: [ShopsModule, LayoutModule],
  controllers: [WallController],
  providers: [WallService],
})
export class WallModule {}
