import { Module } from '@nestjs/common';

import { ShopsModule } from '../shops/shops.module';
import { LayoutController } from './controllers/layout.controller';
import { LayoutService } from './services/layout.service';

@Module({
  imports: [ShopsModule],
  controllers: [LayoutController],
  providers: [LayoutService],
  exports: [LayoutService],
})
export class LayoutModule {}
