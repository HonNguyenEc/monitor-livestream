import { Module } from '@nestjs/common';

import { ShopsController } from './controllers/shops.controller';
import { SellerCenterLoginClient } from './clients/seller-center-login.client';
import { CookieRepository } from './repositories/cookie.repository';
import { ShopRepository } from './repositories/shop.repository';
import { SellerAccountService } from './services/seller-account.service';
import { ShopCookieService } from './services/shop-cookie.service';
import { ShopFieldsValidator } from './services/shop-fields.validator';
import { ShopsService } from './services/shops.service';

@Module({
  controllers: [ShopsController],
  providers: [
    ShopsService,
    ShopFieldsValidator,
    SellerAccountService,
    ShopCookieService,
    SellerCenterLoginClient,
    ShopRepository,
    CookieRepository,
  ],
  exports: [ShopsService],
})
export class ShopsModule {}
