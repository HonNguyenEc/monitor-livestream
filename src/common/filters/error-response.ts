import { ErrorResponseDto } from '../dtos/error-response.dto';

export function errorResponse(code: string, message: string, requestId: string): ErrorResponseDto {
  return { detail: message, error: { code, message, request_id: requestId } };
}
