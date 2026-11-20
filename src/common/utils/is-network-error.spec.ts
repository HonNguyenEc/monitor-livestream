import { isNetworkError } from './is-network-error';

describe('isNetworkError', () => {
  it('accepts a fetch failure with a cause', () => {
    expect(
      isNetworkError(new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') })),
    ).toBe(true);
  });

  it('accepts timeout and abort errors', () => {
    expect(isNetworkError(new DOMException('timed out', 'TimeoutError'))).toBe(true);
    expect(isNetworkError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('rejects programming errors and non-errors', () => {
    expect(isNetworkError(new TypeError('x is not a function'))).toBe(false);
    expect(isNetworkError(new Error('boom'))).toBe(false);
    expect(isNetworkError('fetch failed')).toBe(false);
  });
});
