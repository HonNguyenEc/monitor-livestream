import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { delayAfter } from './attempt-delay';
import { Observation } from './verdict-reducer';

const observation = (
  status: LiveStatus.OFFLINE | LiveStatus.UNKNOWN | LiveStatus.NO_SIGNAL,
): Observation => ({
  status,
  reasonCode: ReasonCode.NOT_LIVE,
});

describe('delayAfter', () => {
  it.each([
    [Platform.TIKTOK, LiveStatus.OFFLINE, 20_000],
    [Platform.SHOPEE, LiveStatus.OFFLINE, 60_000],
    [Platform.TIKTOK, LiveStatus.UNKNOWN, 5_000],
    [Platform.SHOPEE, LiveStatus.UNKNOWN, 15_000],
    [Platform.TIKTOK, LiveStatus.NO_SIGNAL, 3_000],
    [Platform.SHOPEE, LiveStatus.NO_SIGNAL, 3_000],
  ] as const)('%s after %s waits %i ms', (platform, status, expected) => {
    expect(delayAfter(platform, observation(status))).toBe(expected);
  });
});
