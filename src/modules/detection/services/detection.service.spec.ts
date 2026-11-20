import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { JobState } from '../../../common/enums/job-state.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { DetectionControl, DetectionStateStore } from '../../detection-state';
import { Channel, ChannelDirectory } from '../../shops';
import { DetectionJobManager } from './detection-job.manager';
import { DetectionService } from './detection.service';
import { StreamRefresher } from './stream-refresher';

const channel: Channel = {
  key: 'tiktok_a',
  platform: Platform.TIKTOK,
  source: ShopSource.LOCAL,
  label: 'a',
  username: 'a',
};

describe('DetectionService', () => {
  const store = new DetectionStateStore();
  const control = new DetectionControl();
  const directory = {
    require: jest.fn(async (key: string) => {
      if (key !== channel.key) throw new DomainException(ErrorCode.SHOP_NOT_FOUND, 'no');
      return channel;
    }),
  };
  const jobs = {
    start: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    isActive: jest.fn(),
    restartActive: jest.fn().mockResolvedValue(undefined),
    streamUrl: jest.fn(),
  };
  const refresher = { refresh: jest.fn() };
  const service = new DetectionService(
    directory as unknown as ChannelDirectory,
    store,
    jobs as unknown as DetectionJobManager,
    refresher as unknown as StreamRefresher,
    control,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of store.keys()) store.delete(key);
  });

  it('takes over the stop of a channel for modules that cannot depend on it', async () => {
    service.onModuleInit();

    await control.stop('tiktok_a');

    expect(jobs.stop).toHaveBeenCalledWith('tiktok_a');
  });

  it('stops by key without looking the channel up', async () => {
    await expect(service.stop('gone')).resolves.toEqual({
      key: 'gone',
      state: JobState.STOPPED,
      message: null,
      reason_code: null,
    });
    expect(directory.require).not.toHaveBeenCalled();
  });

  it('starts the job of a known channel and answers its state', async () => {
    jobs.start.mockResolvedValue({
      jobState: JobState.ERROR,
      message: null,
      reasonCode: ReasonCode.TOOL_MISSING,
    });

    await expect(service.start('tiktok_a')).resolves.toEqual({
      key: 'tiktok_a',
      state: JobState.ERROR,
      message: null,
      reason_code: ReasonCode.TOOL_MISSING,
    });
    expect(jobs.start).toHaveBeenCalledWith(channel);
  });

  it('does not start a job for an unknown channel', async () => {
    await expect(service.start('nope')).rejects.toMatchObject({ code: ErrorCode.SHOP_NOT_FOUND });
    expect(jobs.start).not.toHaveBeenCalled();
  });

  it('refreshes a stream, or says it is unavailable', async () => {
    refresher.refresh.mockResolvedValueOnce('https://cdn/new.flv').mockResolvedValueOnce(null);

    await expect(service.refreshStream(channel)).resolves.toBe('https://cdn/new.flv');
    await expect(service.refreshStream(channel)).rejects.toMatchObject({
      code: ErrorCode.STREAM_UNAVAILABLE,
    });
  });

  describe('frame', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'live-qc-frame-'));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('serves the latest frame of the channel', async () => {
      const framePath = join(dir, 'latest.jpg');
      await writeFile(framePath, 'JPEG');
      store.update('tiktok_a', { framePath });

      expect((await service.frame('tiktok_a')).toString()).toBe('JPEG');
    });

    it('is FRAME_NOT_FOUND without a frame, and when the file is gone', async () => {
      await expect(service.frame('tiktok_a')).rejects.toMatchObject({
        code: ErrorCode.FRAME_NOT_FOUND,
      });
      store.update('tiktok_a', { framePath: join(dir, 'missing.jpg') });

      await expect(service.frame('tiktok_a')).rejects.toMatchObject({
        code: ErrorCode.FRAME_NOT_FOUND,
      });
    });

    it('is SHOP_NOT_FOUND for an unknown channel', async () => {
      await expect(service.frame('nope')).rejects.toMatchObject({ code: ErrorCode.SHOP_NOT_FOUND });
    });
  });
});
