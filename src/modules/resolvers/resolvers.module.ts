import { Module } from '@nestjs/common';
import { BackendModule } from '../backend';
import { ShopeeModule } from '../shopee';
import { BackendPlayUrlResolver } from './backend/backend-play-url.resolver';
import { PLATFORM_RESOLVERS, PlatformResolver } from './interfaces/platform-resolver.interface';
import { ResolverService } from './services/resolver.service';
import { ShopeeSellerCenterResolver } from './shopee/shopee-seller-center.resolver';
import { TikTokRoomClient } from './tiktok/tiktok-room.client';
import { TikTokResolver } from './tiktok/tiktok.resolver';
import { UnavailableYtDlpRunner } from './ytdlp/unavailable-ytdlp.runner';
import { YtDlpFallback } from './ytdlp/ytdlp-fallback.service';
import { YTDLP_RUNNER } from './ytdlp/ytdlp-runner';

@Module({
  imports: [BackendModule, ShopeeModule],
  providers: [
    BackendPlayUrlResolver,
    TikTokRoomClient,
    YtDlpFallback,
    { provide: YTDLP_RUNNER, useClass: UnavailableYtDlpRunner },
    TikTokResolver,
    ShopeeSellerCenterResolver,
    {
      provide: PLATFORM_RESOLVERS,
      useFactory: (
        backend: BackendPlayUrlResolver,
        tiktok: TikTokResolver,
        shopee: ShopeeSellerCenterResolver,
      ): PlatformResolver[] => [backend, tiktok, shopee],
      inject: [BackendPlayUrlResolver, TikTokResolver, ShopeeSellerCenterResolver],
    },
    ResolverService,
  ],
  exports: [ResolverService],
})
export class ResolversModule {}
