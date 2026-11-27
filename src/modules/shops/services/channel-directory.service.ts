import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { Platform } from '../../../common/enums/platform.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ResolveRequest } from '../../resolvers';
import { BackendSyncStore } from '../../backend';
import { Channel } from '../models/channel.model';
import { ShopRepository } from '../repositories/shop.repository';
import { allShops, toChannel } from '../utils/channel';
import { ShopCookieService } from './shop-cookie.service';

/** What other modules read about channels; never a DTO, never a write. */
@Injectable()
export class ChannelDirectory {
  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly backendStore: BackendSyncStore,
    private readonly shopCookies: ShopCookieService,
  ) {}

  async channels(): Promise<Channel[]> {
    return allShops(await this.shopRepository.load(), this.backendStore).map(toChannel);
  }

  /** The first channel with this key, as the Python tool picks when two entries share one. */
  async channel(key: string): Promise<Channel | undefined> {
    return (await this.channels()).find((channel) => channel.key === key);
  }

  /** The channel, or SHOP_NOT_FOUND. */
  async require(key: string): Promise<Channel> {
    const channel = await this.channel(key);
    if (!channel) {
      throw new DomainException(ErrorCode.SHOP_NOT_FOUND, ErrorMessage.shopNotFound(key));
    }
    return channel;
  }

  /**
   * Reads the stored cookie now, so a job that rebuilds its request per attempt uses a fresh one.
   * Throws COOKIES_FILE_UNREADABLE when the cookie file cannot be read: that is not a missing cookie.
   */
  async toResolveRequest(channel: Channel): Promise<ResolveRequest> {
    const request: ResolveRequest = {
      key: channel.key,
      platform: channel.platform,
      username: channel.username,
      userId: channel.userId,
      liveUrl: channel.liveUrl,
      brandId: channel.brandId,
    };
    if (channel.platform === Platform.SHOPEE && channel.userId !== undefined) {
      const cookie = (await this.shopCookies.load())[String(channel.userId)];
      if (typeof cookie === 'string') request.cookie = cookie;
    }
    return request;
  }
}
