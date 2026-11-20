import { Module } from '@nestjs/common';

import { ShopsController } from './controllers/shops.controller';
import { ShopsService } from './services/shops.service';

@Module({
  controllers: [ShopsController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
