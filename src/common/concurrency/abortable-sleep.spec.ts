import { abortableSleep } from './abortable-sleep';

describe('abortableSleep', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves true once the time has passed', async () => {
    const sleeping = abortableSleep(5_000, new AbortController().signal);

    await jest.advanceTimersByTimeAsync(5_000);

    expect(await sleeping).toBe(true);
  });

  it('resolves false at once when the signal aborts, and leaves no timer behind', async () => {
    const controller = new AbortController();
    const sleeping = abortableSleep(5_000, controller.signal);

    controller.abort();

    expect(await sleeping).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('resolves false without waiting for a signal that already aborted', async () => {
    expect(await abortableSleep(5_000, AbortSignal.abort())).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
