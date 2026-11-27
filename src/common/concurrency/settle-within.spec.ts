import { settleWithin } from './settle-within';

describe('settleWithin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('gives the value of a promise that settles in time, and leaves no timer behind', async () => {
    expect(await settleWithin(Promise.resolve(1), 5_000, 0)).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('gives the fallback once the time has passed', async () => {
    const settling = settleWithin(new Promise<number>(() => undefined), 5_000, 0);

    await jest.advanceTimersByTimeAsync(5_000);

    expect(await settling).toBe(0);
  });
});
