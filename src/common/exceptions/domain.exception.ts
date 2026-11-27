import { ErrorCode } from '../constants/error-codes.constants';

/** An expected failure with a stable machine-readable code; AllExceptionsFilter picks the HTTP status. */
export class DomainException extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = DomainException.name;
  }
}
