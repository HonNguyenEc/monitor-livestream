import { NO_HTTP_STATUS } from '../constants/backend.constants';
import { BackendRequestError } from './backend-request.error';

/** No usable login: never logged in, logged out, or the refresh token was rejected. */
export class BackendAuthError extends BackendRequestError {
  /** Set when this error is the one that ended the login: the epoch the login ended in, so its own caller can tell it from a stale failure. */
  endedEpoch?: number;

  constructor(message: string, status = NO_HTTP_STATUS, options?: ErrorOptions) {
    super(message, status, '', null, options);
    this.name = BackendAuthError.name;
  }
}
