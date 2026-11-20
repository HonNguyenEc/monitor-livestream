import { Platform } from '../../../common/enums/platform.enum';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { PlatformResolver } from '../interfaces/platform-resolver.interface';
import { resolved } from '../models/resolve-result.model';
import { ResolverService } from './resolver.service';

function fakeResolver(platform: Platform, url: string): PlatformResolver {
  return { platform, resolve: jest.fn().mockResolvedValue(resolved([url], platform)) };
}

describe('ResolverService', () => {
  const tiktok = fakeResolver(Platform.TIKTOK, 'https://example.invalid/t.flv');
  const shopee = fakeResolver(Platform.SHOPEE, 'https://example.invalid/s.flv');
  const service = new ResolverService([tiktok, shopee]);

  it('dispatches by platform', async () => {
    const request = { key: 'k', platform: Platform.SHOPEE };
    const result = await service.resolve(request);
    expect(result).toEqual(resolved(['https://example.invalid/s.flv'], Platform.SHOPEE));
    expect(shopee.resolve).toHaveBeenCalledWith(request);
    expect(tiktok.resolve).not.toHaveBeenCalled();
  });

  it('returns an unsupported failure when no resolver is registered', async () => {
    const result = await new ResolverService([tiktok]).resolve({
      key: 'k',
      platform: Platform.SHOPEE,
    });
    expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.UNSUPPORTED });
  });
});
