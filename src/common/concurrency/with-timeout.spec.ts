import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('aborts after the timeout when there is no caller signal', async () => {
    const signal = withTimeout(10);

    expect(signal.aborted).toBe(false);
    await new Promise((done) => setTimeout(done, 60));

    expect(signal.aborted).toBe(true);
  });

  it('aborts with the reason of the caller signal', () => {
    const controller = new AbortController();
    const signal = withTimeout(60_000, controller.signal);

    controller.abort(new Error('stopped'));

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toEqual(new Error('stopped'));
  });

  it('still times out when a caller signal is present', async () => {
    const signal = withTimeout(10, new AbortController().signal);

    await new Promise((done) => setTimeout(done, 60));

    expect(signal.aborted).toBe(true);
  });
});
