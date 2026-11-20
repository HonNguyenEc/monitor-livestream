import { safeError } from './safe-error';

describe('safeError', () => {
  it('masks URLs', () => {
    expect(safeError('failed https://cdn.example.com/a.flv?sign=abc now')).toBe('failed [url] now');
  });

  it('redacts secret values after cookie, token, authorization and signature', () => {
    expect(safeError('token=xyz failed')).toBe('token=[redacted] failed');
    expect(safeError('Signature abc')).toBe('Signature [redacted]');
  });

  it('redacts a whole cookie header and an authorization scheme with its credential', () => {
    expect(safeError('Cookie: SPC_SC_SESSION=x; other=y\nnext line')).toBe(
      'Cookie: [redacted]\nnext line',
    );
    expect(safeError('Authorization: Bearer abc123')).toBe('Authorization: [redacted]');
    expect(safeError('token: Bearer abc123 end')).toBe('token: [redacted] end');
    expect(safeError('COOKIE=a=b; c=d')).toBe('COOKIE=[redacted]');
  });

  it('keeps the last 1200 characters', () => {
    const out = safeError(`${'a'.repeat(1500)}END`);
    expect(out).toHaveLength(1200);
    expect(out.endsWith('END')).toBe(true);
  });

  it('redacts JSON-quoted secrets', () => {
    expect(safeError('{"token":"abc123","x":1}')).toBe('{"token":"[redacted]');
    expect(safeError('{"cookie":"a=b; c=d"}')).toBe('{"cookie":"[redacted]');
  });

  it('redacts a SPC_SC_SESSION value even across a newline', () => {
    const text = 'Headers.append: "SPC_SC_SESSION=secret\nmore" is an invalid header value.';
    const out = safeError(text);
    expect(out).toBe('Headers.append: "SPC_SC_SESSION=[redacted]" is an invalid header value.');
  });
});
