import { HttpStatus } from '@nestjs/common';

export const ErrorCode = {
  SHOP_NOT_FOUND: 'SHOP_NOT_FOUND',
  SHOP_ALREADY_EXISTS: 'SHOP_ALREADY_EXISTS',
  BACKEND_SHOP_READ_ONLY: 'BACKEND_SHOP_READ_ONLY',
  FRAME_NOT_FOUND: 'FRAME_NOT_FOUND',
  NO_PLATFORM_SELECTED: 'NO_PLATFORM_SELECTED',
  BACKEND_NOT_CONNECTED: 'BACKEND_NOT_CONNECTED',
  BACKEND_LOGIN_FAILED: 'BACKEND_LOGIN_FAILED',
  STREAM_UNAVAILABLE: 'STREAM_UNAVAILABLE',
  SHOPS_FILE_UNREADABLE: 'SHOPS_FILE_UNREADABLE',
  COOKIES_FILE_UNREADABLE: 'COOKIES_FILE_UNREADABLE',
  LAYOUT_FILE_UNREADABLE: 'LAYOUT_FILE_UNREADABLE',
  HOST_NOT_ALLOWED: 'HOST_NOT_ALLOWED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  // Same code the validation pipe sends; for values only the service can check.
  BAD_REQUEST: 'BAD_REQUEST',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const FIRST_ERROR_STATUS = 400;

/** The name the filter gives a framework error: HttpStatus[status], for every 4xx and 5xx status. */
const HTTP_ERROR_CODES: string[] = Object.values(HttpStatus)
  .filter((status): status is number => typeof status === 'number' && status >= FIRST_ERROR_STATUS)
  .map((status) => HttpStatus[status]);

/** Every value `error.code` can take: the domain codes, then the HTTP status names of other errors; published in OpenAPI. */
export const ERROR_BODY_CODES: readonly string[] = [
  ...new Set([...Object.values(ErrorCode), ...HTTP_ERROR_CODES]),
];
