import { Module } from '@nestjs/common';
import { BackendModule } from '../backend/backend.module';
import { BackendPlayUrlResolver } from './backend/backend-play-url.resolver';
import { PLATFORM_RESOLVERS, PlatformResolver } from './interfaces/platform-resolver.interface';
import { ResolverService } from './services/resolver.service';
import { ShopeeSellerCenterResolver } from './shopee/shopee-seller-center.resolver';
import { SellerCenterSessionClient } from './shopee/seller-center-session.client';
import { TikTokRoomClient } from './tiktok/tiktok-room.client';
import { TikTokResolver } from './tiktok/tiktok.resolver';
import { UnavailableYtDlpRunner } from './ytdlp/unavailable-ytdlp.runner';
import { YtDlpFallback } from './ytdlp/ytdlp-fallback.service';
import { YTDLP_RUNNER } from './ytdlp/ytdlp-runner';

@Module({
  imports: [BackendModule],
  providers: [
    BackendPlayUrlResolver,
    TikTokRoomClient,
    SellerCenterSessionClient,
    YtDlpFallback,
    { provide: YTDLP_RUNNER, useClass: UnavailableYtDlpRunner },
    TikTokResolver,
    ShopeeSellerCenterResolver,
    {
      provide: PLATFORM_RESOLVERS,
      useFactory: (
        tiktok: TikTokResolver,
        shopee: ShopeeSellerCenterResolver,
      ): PlatformResolver[] => [tiktok, shopee],
      inject: [TikTokResolver, ShopeeSellerCenterResolver],
    },
    ResolverService,
  ],
  exports: [ResolverService],
})
export class ResolversModule {}
