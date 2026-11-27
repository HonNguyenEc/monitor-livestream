import { DEFAULT_RESOLVE_TIMEOUT_MS, MIN_HOP_TIMEOUT_MS } from '../constants/resolver.constants';
import { ResolveDeadline } from './resolve-deadline';

describe('ResolveDeadline', () => {
  it('hands each hop what is left of the budget', () => {
    const deadline = new ResolveDeadline(1000, undefined, 5000);

    expect(deadline.remainingMs(5000)).toBe(1000);
    expect(deadline.remainingMs(5400)).toBe(600);
  });

  it('never goes below the minimum hop timeout once the budget is spent', () => {
    const deadline = new ResolveDeadline(1000, undefined, 5000);

    expect(deadline.remainingMs(9000)).toBe(MIN_HOP_TIMEOUT_MS);
  });

  it('takes the budget and the signal from the request, with the default budget', () => {
    const { signal } = new AbortController();

    const given = ResolveDeadline.of(
      { key: 'k', platform: 'tiktok', timeoutMs: 700, signal } as never,
      0,
    );
    const defaulted = ResolveDeadline.of({ key: 'k', platform: 'tiktok' } as never, 0);

    expect(given.remainingMs(0)).toBe(700);
    expect(given.signal).toBe(signal);
    expect(defaulted.remainingMs(0)).toBe(DEFAULT_RESOLVE_TIMEOUT_MS);
    expect(defaulted.signal).toBeUndefined();
  });
});
