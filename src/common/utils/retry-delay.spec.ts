import { retryDelayMs } from './retry-delay';

const SCHEDULE = [30_000, 60_000, 120_000, 300_000];
const CAP = 600_000;

describe('retryDelayMs', () => {
  it.each([
    [1, 30_000],
    [2, 60_000],
    [3, 120_000],
    [4, 300_000],
    [9, 300_000],
  ])('waits the step of failure %i', (failures, expected) => {
    expect(retryDelayMs(failures, SCHEDULE, null, CAP)).toBe(expected);
  });

  it('treats a count below 1 as the first failure', () => {
    expect(retryDelayMs(0, SCHEDULE, null, CAP)).toBe(30_000);
  });

  it('lets the server Retry-After replace the step, up to the cap', () => {
    expect(retryDelayMs(1, SCHEDULE, 45, CAP)).toBe(45_000);
    expect(retryDelayMs(1, SCHEDULE, 99_999, CAP)).toBe(CAP);
  });

  it('ignores a Retry-After of 0', () => {
    expect(retryDelayMs(2, SCHEDULE, 0, CAP)).toBe(60_000);
  });

  it('never exceeds the cap with its own schedule', () => {
    expect(retryDelayMs(3, [100_000, 900_000], null, CAP)).toBe(CAP);
  });
});
