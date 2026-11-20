import { ErrorBodyDto } from './error-body.dto';

/** Same shape as livestream-backend errors, so the admin's apiError helpers parse both. */
export class ErrorResponseDto {
  detail: string;
  error: ErrorBodyDto;
}
