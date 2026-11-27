import { Platform } from '../../../common/enums/platform.enum';
import { MonitorSelection } from '../models/monitor-selection.model';
import { MonitorService } from './monitor.service';
import { MonitorSupervisor } from './monitor-supervisor';

describe('MonitorService', () => {
  let selection: MonitorSelection | null;
  const supervisor = {
    begin: jest.fn((next: MonitorSelection) => {
      selection = next;
    }),
    end: jest.fn(async () => {
      selection = null;
    }),
    get current() {
      return selection;
    },
  };
  const service = new MonitorService(supervisor as unknown as MonitorSupervisor);

  beforeEach(() => {
    selection = null;
    jest.clearAllMocks();
  });

  it('is stopped until started', () => {
    expect(service.current()).toEqual({ running: false, platforms: [], keys: null });
  });

  it('starts with the platforms and keys, and a second start replaces them', async () => {
    expect(await service.start({ platforms: [Platform.TIKTOK], keys: ['a'] })).toEqual({
      running: true,
      platforms: ['tiktok'],
      keys: ['a'],
    });
    expect(await service.start({ platforms: [Platform.SHOPEE] })).toEqual({
      running: true,
      platforms: ['shopee'],
      keys: null,
    });
  });

  it('refuses a start without platforms and leaves the monitor as it was', async () => {
    await expect(service.start({ platforms: [] })).rejects.toMatchObject({
      code: 'NO_PLATFORM_SELECTED',
    });
    expect(supervisor.begin).not.toHaveBeenCalled();
  });

  it('stops the supervisor before it answers', async () => {
    await service.start({ platforms: [Platform.TIKTOK] });

    expect(await service.stop()).toEqual({ running: false, platforms: [], keys: null });
    expect(supervisor.end).toHaveBeenCalledTimes(1);
  });
});
