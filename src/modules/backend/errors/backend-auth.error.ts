import { NO_HTTP_STATUS } from '../constants/backend.constants';
import { BackendRequestError } from './backend-request.error';

/** No usable login: never logged in, logged out, or the refresh token was rejected. */
export class BackendAuthError extends BackendRequestError {
  constructor(message: string, status = NO_HTTP_STATUS, options?: ErrorOptions) {
    super(message, status, '', null, options);
    this.name = BackendAuthError.name;
  }
}
