import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { BackendBrand } from '../../backend/models/backend-brand.model';
import { BackendSyncStore } from '../../backend/services/backend-sync-store.service';
import { ShopsDocument } from '../models/shop-record.model';
import { ShopRepository } from '../repositories/shop.repository';
import { ChannelDirectory } from './channel-directory.service';
import { ShopCookieService } from './shop-cookie.service';

const DOCUMENT: ShopsDocument = {
  shops: [
    { platform: 'tiktok', username: 'unidry', live_url: 'https://www.tiktok.com/@unidry/live' },
    { platform: 'shopee', name: 'nivea', user_id: 61924024, shop_id: 5 },
    { platform: 'youtube', username: 'skipped' },
  ],
};

describe('ChannelDirectory', () => {
  let cookies: Record<string, unknown>;
  let cookieRead: () => Promise<Record<string, unknown>>;
  let brands: BackendBrand[];
  let directory: ChannelDirectory;

  beforeEach(() => {
    cookies = { '61924024': 'SPC_SC_SESSION=first' };
    cookieRead = () => Promise.resolve(cookies);
    brands = [{ id: 'b-1', name: 'Brand One' } as BackendBrand];
    directory = new ChannelDirectory(
      { load: () => Promise.resolve(DOCUMENT) } as unknown as ShopRepository,
      {
        get brands() {
          return brands;
        },
      } as unknown as BackendSyncStore,
      { load: () => cookieRead() } as unknown as ShopCookieService,
    );
  });

  it('lists the local channels in file order, then the backend ones', async () => {
    const channels = await directory.channels();

    expect(channels.map((channel) => channel.key)).toEqual([
      'tiktok_unidry',
      'shopee_nivea',
      expect.stringMatching(/^shopee_api_[0-9a-f]{10}$/),
    ]);
    expect(channels[0]).toMatchObject({
      platform: Platform.TIKTOK,
      source: ShopSource.LOCAL,
      label: 'unidry',
      username: 'unidry',
      liveUrl: 'https://www.tiktok.com/@unidry/live',
    });
    expect(channels[1]).toMatchObject({ userId: 61924024 });
    expect(channels[2]).toMatchObject({
      source: ShopSource.BACKEND,
      label: 'Brand One',
      brandId: 'b-1',
    });
  });

  it('finds a channel by key and refuses an unknown one', async () => {
    expect((await directory.channel('shopee_nivea'))?.label).toBe('nivea');
    expect(await directory.channel('nope')).toBeUndefined();
    await expect(directory.require('nope')).rejects.toMatchObject({
      code: ErrorCode.SHOP_NOT_FOUND,
    });
    await expect(directory.require('nope')).rejects.toBeInstanceOf(DomainException);
  });

  it('builds the request with the cookie stored at that moment', async () => {
    const channel = await directory.require('shopee_nivea');

    const first = await directory.toResolveRequest(channel);
    cookies['61924024'] = 'SPC_SC_SESSION=second';
    const second = await directory.toResolveRequest(channel);

    expect(first).toMatchObject({
      key: 'shopee_nivea',
      platform: Platform.SHOPEE,
      userId: 61924024,
      cookie: 'SPC_SC_SESSION=first',
    });
    expect(second.cookie).toBe('SPC_SC_SESSION=second');
  });

  it('fails with COOKIES_FILE_UNREADABLE instead of reading an unreadable cookie file as no cookie', async () => {
    cookieRead = () => Promise.reject(new DomainException(ErrorCode.COOKIES_FILE_UNREADABLE, 'x'));
    const nivea = await directory.require('shopee_nivea');

    await expect(directory.toResolveRequest(nivea)).rejects.toMatchObject({
      code: ErrorCode.COOKIES_FILE_UNREADABLE,
    });
  });

  it('leaves the cookie out when none is stored, and for a TikTok or backend channel', async () => {
    cookies = {};
    const [tiktok, nivea, backend] = await directory.channels();

    expect((await directory.toResolveRequest(nivea)).cookie).toBeUndefined();
    expect(await directory.toResolveRequest(tiktok)).toMatchObject({ username: 'unidry' });
    expect(await directory.toResolveRequest(backend)).toMatchObject({ brandId: 'b-1' });
  });
});
