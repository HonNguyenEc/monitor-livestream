import { tmpdir } from 'node:os';
import { Test } from '@nestjs/testing';
import { DATA_DIR, DataDirModule } from '../../config/data-dir.module';
import { Platform } from '../../common/enums/platform.enum';
import { ResolveFailureCode } from './enums/resolve-failure-code.enum';
import { ResolversModule } from './resolvers.module';
import { ResolverService } from './services/resolver.service';

describe('ResolversModule', () => {
  afterEach(() => jest.restoreAllMocks());

  async function service(): Promise<ResolverService> {
    const moduleRef = await Test.createTestingModule({
      imports: [DataDirModule, ResolversModule],
    })
      .overrideProvider(DATA_DIR)
      .useValue(tmpdir())
      .compile();
    return moduleRef.get(ResolverService);
  }

  it('dispatches a Shopee request to the Shopee resolver', async () => {
    const result = await (await service()).resolve({ key: 'k', platform: Platform.SHOPEE });
    expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.MISSING_COOKIE });
  });

  it('dispatches a TikTok request and reports yt-dlp as unavailable when the room API fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const result = await (
      await service()
    ).resolve({
      key: 'k',
      platform: Platform.TIKTOK,
      username: 'someone',
    });
    expect(result).toEqual({
      ok: false,
      code: ResolveFailureCode.YTDLP_FAILED,
      detail: 'room API: offline; yt-dlp: yt-dlp is not installed',
    });
  });
});
