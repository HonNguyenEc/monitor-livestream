import { ErrorCode } from '../constants/error-codes.constants';
import { DomainException } from './domain.exception';

/** A value only the service can check; the message is shown to the operator as is. */
export function badRequest(message: string): DomainException {
  return new DomainException(ErrorCode.BAD_REQUEST, message);
}
