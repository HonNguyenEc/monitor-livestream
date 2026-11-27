import { HttpStatus } from '@nestjs/common';

import { BackendRequestError } from './backend-request.error';

/** The backend answered 2xx with a body that is not the documented shape. */
export class BackendAnswerError extends BackendRequestError {
  constructor(message: string) {
    super(message, HttpStatus.BAD_GATEWAY);
    this.name = BackendAnswerError.name;
  }
}
