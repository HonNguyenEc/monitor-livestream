import { Platform } from '../../../common/enums/platform.enum';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { PlatformResolver } from '../interfaces/platform-resolver.interface';
import { resolved } from '../models/resolve-result.model';
import { BackendPlayUrlResolver } from '../backend/backend-play-url.resolver';
import { ResolverService } from './resolver.service';

function fakeResolver(platform: Platform, url: string): PlatformResolver {
  return { platform, resolve: jest.fn().mockResolvedValue(resolved([url], platform)) };
}

describe('ResolverService', () => {
  afterEach(() => jest.clearAllMocks());

  const tiktok = fakeResolver(Platform.TIKTOK, 'https://example.invalid/t.flv');
  const shopee = fakeResolver(Platform.SHOPEE, 'https://example.invalid/s.flv');
  const backend = {
    resolve: jest.fn().mockResolvedValue(resolved(['https://example.invalid/b.flv'], 'backend')),
  };
  const service = new ResolverService(
    [tiktok, shopee],
    backend as unknown as BackendPlayUrlResolver,
  );

  it('dispatches by platform', async () => {
    const request = { key: 'k', platform: Platform.SHOPEE };
    const result = await service.resolve(request);
    expect(result).toEqual(resolved(['https://example.invalid/s.flv'], Platform.SHOPEE));
    expect(shopee.resolve).toHaveBeenCalledWith(request);
    expect(tiktok.resolve).not.toHaveBeenCalled();
  });

  it('sends a channel with a brand id to the backend resolver, whatever its platform', async () => {
    const request = {
      key: 'k',
      platform: Platform.SHOPEE,
      brandId: 'b1',
      cookie: 'SPC_SC_SESSION=x',
    };

    const result = await service.resolve(request);

    expect(result).toEqual(resolved(['https://example.invalid/b.flv'], 'backend'));
    expect(backend.resolve).toHaveBeenCalledWith(request);
    expect(shopee.resolve).not.toHaveBeenCalled();
  });

  it('returns an unsupported failure when no resolver is registered', async () => {
    const result = await new ResolverService(
      [tiktok],
      backend as unknown as BackendPlayUrlResolver,
    ).resolve({
      key: 'k',
      platform: Platform.SHOPEE,
    });
    expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.UNSUPPORTED });
  });
});
