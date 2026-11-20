import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { NO_HTTP_STATUS } from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendAuthError } from '../errors/backend-auth.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { backendErrorDetail, backendErrorText } from './backend-error-text';

describe('backendErrorText', () => {
  it.each([
    ['no login', new BackendAuthError('x'), ErrorMessage.backendNotConnected],
    ['a refused refresh token', new BackendAuthError('x', 401), ErrorMessage.backendLoginExpired],
    ['an unusable answer', new BackendAnswerError('x'), ErrorMessage.backendAnswerInvalid],
    ['no answer', new BackendRequestError('x', NO_HTTP_STATUS), ErrorMessage.backendNoAnswer],
    [
      'an error status',
      new BackendRequestError('x', 503, 'busy'),
      ErrorMessage.backendAnswered(503, 'busy'),
    ],
  ])('says %s in Vietnamese', (_case, error, text) => {
    expect(backendErrorText(error)).toBe(text);
  });

  it('masks the raw text of an unexpected error', () => {
    expect(backendErrorText(new Error('boom token=abc.def'))).toBe('boom token=[redacted]');
  });
});

describe('backendErrorDetail', () => {
  it('gives the masked message with the masked cause', () => {
    const cause = new Error('ECONNRESET token=abc.def');
    const error = new BackendRequestError('Backend did not answer', NO_HTTP_STATUS, '', null, {
      cause,
    });

    const detail = backendErrorDetail(error);

    expect(detail).toContain('Backend did not answer');
    expect(detail).toContain('ECONNRESET token=[redacted]');
    expect(detail).not.toContain('abc.def');
  });
});
