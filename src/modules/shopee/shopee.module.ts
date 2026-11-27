import { Module } from '@nestjs/common';

import { SellerCenterClient } from './clients/seller-center.client';

/** Leaf module: the one place that talks to Shopee. */
@Module({
  providers: [SellerCenterClient],
  exports: [SellerCenterClient],
})
export class ShopeeModule {}
