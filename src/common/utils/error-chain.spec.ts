import { errorChain, wrappedErrorCode } from './error-chain';

describe('errorChain', () => {
  it('follows the cause, then the first error of an AggregateError', () => {
    const inner = new Error('connect ECONNREFUSED');
    const aggregate = new AggregateError([inner], '');
    const outer = new TypeError('fetch failed', { cause: aggregate });

    expect(errorChain(outer)).toEqual([outer, aggregate, inner]);
  });

  it('stops after a few levels, so a cycle cannot loop forever', () => {
    const a: { cause?: unknown } = {};
    a.cause = a;

    expect(errorChain(a).length).toBeLessThan(10);
  });

  it('is empty for nothing', () => {
    expect(errorChain(undefined)).toEqual([]);
  });
});

describe('wrappedErrorCode', () => {
  it('reads the code one or two levels down, never the error own code', () => {
    const socket = Object.assign(new Error('x'), { code: 'ECONNRESET' });
    const outer = Object.assign(new TypeError('fetch failed', { cause: { cause: socket } }), {
      code: 'OWN',
    });

    expect(wrappedErrorCode(outer)).toBe('ECONNRESET');
  });

  it('is undefined without a coded cause', () => {
    expect(wrappedErrorCode(new Error('x', { cause: new Error('y') }))).toBeUndefined();
  });
});
