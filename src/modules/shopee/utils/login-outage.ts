import { HttpStatus } from '@nestjs/common';

/** Seller Center gave no usable answer: 5xx, 429, or a 200 whose body is not a JSON object. */
export function isLoginOutage(status: number, invalidBody: boolean | undefined): boolean {
  return (
    status >= HttpStatus.INTERNAL_SERVER_ERROR ||
    status === HttpStatus.TOO_MANY_REQUESTS ||
    (status === HttpStatus.OK && invalidBody === true)
  );
}
