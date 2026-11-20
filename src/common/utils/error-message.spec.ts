import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('appends the cause that fetch attaches to its generic failure', () => {
    const error = new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') });
    expect(errorMessage(error)).toBe('fetch failed: connect ECONNREFUSED');
  });

  it('stringifies a non-Error value', () => {
    expect(errorMessage('plain')).toBe('plain');
  });

  it('appends a string cause', () => {
    expect(errorMessage(new Error('failed', { cause: 'ECONNRESET' }))).toBe('failed: ECONNRESET');
  });

  it('falls back to the code of a cause without a message', () => {
    const cause = Object.assign(new Error(''), { code: 'ECONNREFUSED' });
    expect(errorMessage(new TypeError('fetch failed', { cause }))).toBe(
      'fetch failed: ECONNREFUSED',
    );
  });

  it('reads the first error of an AggregateError cause', () => {
    const cause = new AggregateError([new Error('connect ECONNREFUSED ::1')], '');
    expect(errorMessage(new TypeError('fetch failed', { cause }))).toBe(
      'fetch failed: connect ECONNREFUSED ::1',
    );
  });

  it('leaves no trailing colon when the cause says nothing', () => {
    expect(errorMessage(new TypeError('fetch failed', { cause: new Error('') }))).toBe(
      'fetch failed',
    );
  });
});
