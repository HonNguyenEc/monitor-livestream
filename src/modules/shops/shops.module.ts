import { Module } from '@nestjs/common';

import { BackendModule } from '../backend';
import { ShopeeModule } from '../shopee';
import { DetectionStateModule } from '../detection-state';
import { ShopsController } from './controllers/shops.controller';
import { CookieRepository } from './repositories/cookie.repository';
import { ShopRepository } from './repositories/shop.repository';
import { ChannelDirectory } from './services/channel-directory.service';
import { SellerAccountService } from './services/seller-account.service';
import { ShopCookieService } from './services/shop-cookie.service';
import { ShopFieldsValidator } from './services/shop-fields.validator';
import { ShopsService } from './services/shops.service';

@Module({
  imports: [BackendModule, DetectionStateModule, ShopeeModule],
  controllers: [ShopsController],
  providers: [
    ShopsService,
    ChannelDirectory,
    ShopFieldsValidator,
    SellerAccountService,
    ShopCookieService,
    ShopRepository,
    CookieRepository,
  ],
  exports: [ChannelDirectory],
})
export class ShopsModule {}
