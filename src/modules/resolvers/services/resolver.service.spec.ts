import { Platform } from '../../../common/enums/platform.enum';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { PlatformResolver } from '../interfaces/platform-resolver.interface';
import { failed, resolved } from '../models/resolve-result.model';
import { ResolverService } from './resolver.service';

function fakeResolver(platform: Platform, url: string): PlatformResolver {
  return {
    supports: (request) => request.platform === platform && request.brandId === undefined,
    resolve: jest.fn().mockResolvedValue(resolved([url], platform)),
  };
}

describe('ResolverService', () => {
  afterEach(() => jest.clearAllMocks());

  const tiktok = fakeResolver(Platform.TIKTOK, 'https://example.invalid/t.flv');
  const shopee = fakeResolver(Platform.SHOPEE, 'https://example.invalid/s.flv');
  const backend: PlatformResolver = {
    supports: (request) => request.brandId !== undefined,
    resolve: jest.fn().mockResolvedValue(resolved(['https://example.invalid/b.flv'], 'backend')),
  };
  const service = new ResolverService([backend, tiktok, shopee]);

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

  it('reports a resolve the caller aborted as cancelled, whatever the resolver made of it', async () => {
    const controller = new AbortController();
    const aborted = {
      supports: () => true,
      resolve: jest.fn().mockImplementation(() => {
        controller.abort();
        return Promise.resolve(failed(ResolveFailureCode.SHOPEE_REQUEST_FAILED, 'aborted'));
      }),
    };
    const throwing = {
      supports: () => true,
      resolve: jest.fn().mockRejectedValue(new Error('bug')),
    };

    const first = await new ResolverService([aborted]).resolve({
      key: 'k',
      platform: Platform.SHOPEE,
      signal: controller.signal,
    });
    const second = await new ResolverService([throwing]).resolve({
      key: 'k',
      platform: Platform.SHOPEE,
      signal: AbortSignal.abort(),
    });

    expect(first).toMatchObject({ ok: false, code: ResolveFailureCode.CANCELLED });
    expect(second).toMatchObject({ ok: false, code: ResolveFailureCode.CANCELLED });
    await expect(
      new ResolverService([throwing]).resolve({ key: 'k', platform: Platform.SHOPEE }),
    ).rejects.toThrow('bug');
  });

  it('returns an unsupported failure when no resolver is registered', async () => {
    const result = await new ResolverService([tiktok]).resolve({
      key: 'k',
      platform: Platform.SHOPEE,
    });
    expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.UNSUPPORTED });
  });
});
