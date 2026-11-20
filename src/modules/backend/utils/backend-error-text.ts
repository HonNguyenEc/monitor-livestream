import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { safeErrorMessage } from '../../../common/utils/safe-error-message';
import { NO_HTTP_STATUS } from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendAuthError } from '../errors/backend-auth.error';
import { BackendRequestError } from '../errors/backend-request.error';

/** A masked reason for a failed backend read: Vietnamese for the known failures, the masked raw text of an unexpected error. Safe for BackendStatus.error and logs. */
export function backendErrorText(error: unknown): string {
  if (error instanceof BackendAuthError) {
    return error.status === NO_HTTP_STATUS
      ? ErrorMessage.backendNotConnected
      : ErrorMessage.backendLoginExpired;
  }
  if (error instanceof BackendAnswerError) {
    return ErrorMessage.backendAnswerInvalid;
  }
  if (error instanceof BackendRequestError) {
    return error.status === NO_HTTP_STATUS
      ? ErrorMessage.backendNoAnswer
      : ErrorMessage.backendAnswered(error.status, error.remoteMessage);
  }
  return safeErrorMessage(error);
}
