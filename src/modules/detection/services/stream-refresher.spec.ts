import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { ResolveFailureCode } from '../../resolvers/enums/resolve-failure-code.enum';
import { failed, resolved, ResolveResult } from '../../resolvers/models/resolve-result.model';
import { Channel } from '../../shops';
import { DetectionJobManager } from './detection-job.manager';
import { StreamRefresher } from './stream-refresher';

const channel: Channel = {
  key: 'tiktok_a',
  platform: Platform.TIKTOK,
  source: ShopSource.LOCAL,
  label: 'a',
  username: 'a',
};

describe('StreamRefresher', () => {
  const resolve = jest.fn<Promise<ResolveResult>, [object]>();
  const toResolveRequest = jest.fn();
  const setStreamUrl = jest.fn();
  const refresher = new StreamRefresher(
    { toResolveRequest } as never,
    { resolve } as never,
    { setStreamUrl } as unknown as DetectionJobManager,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    toResolveRequest.mockResolvedValue({ key: channel.key, platform: channel.platform });
  });

  it('resolves a fresh URL and hands it to the job of the channel', async () => {
    resolve.mockResolvedValue(resolved(['https://cdn/new.flv', 'https://cdn/b'], 'ok'));

    expect(await refresher.refresh(channel)).toBe('https://cdn/new.flv');
    expect(setStreamUrl).toHaveBeenCalledWith('tiktok_a', 'https://cdn/new.flv');
  });

  it('shares one resolve between callers that arrive while it runs', async () => {
    let finish: (result: ResolveResult) => void = () => undefined;
    resolve.mockImplementation(() => new Promise((done) => (finish = done)));

    const first = refresher.refresh(channel);
    const second = refresher.refresh(channel);
    await Promise.resolve();
    finish(resolved(['https://cdn/new.flv'], 'ok'));

    expect(await Promise.all([first, second])).toEqual([
      'https://cdn/new.flv',
      'https://cdn/new.flv',
    ]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolves again once the previous resolve is over', async () => {
    resolve.mockResolvedValue(resolved(['https://cdn/new.flv'], 'ok'));

    await refresher.refresh(channel);
    await refresher.refresh(channel);

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('is null for a failed resolve, and for an error, without touching the job', async () => {
    resolve.mockResolvedValueOnce(failed(ResolveFailureCode.NOT_LIVE, 'off'));
    expect(await refresher.refresh(channel)).toBeNull();

    resolve.mockRejectedValueOnce(new Error('boom'));
    expect(await refresher.refresh(channel)).toBeNull();

    toResolveRequest.mockRejectedValueOnce(new Error('cookie file locked'));
    expect(await refresher.refresh(channel)).toBeNull();
    expect(setStreamUrl).not.toHaveBeenCalled();
  });
});
