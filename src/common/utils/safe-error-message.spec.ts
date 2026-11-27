import { safeErrorMessage } from './safe-error-message';

describe('safeErrorMessage', () => {
  it('gives the masked message with the masked cause', () => {
    const cause = new Error('ECONNRESET token=abc.def');

    const detail = safeErrorMessage(new Error('Backend did not answer', { cause }));

    expect(detail).toBe('Backend did not answer: ECONNRESET token=[redacted]');
  });
});
