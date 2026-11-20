import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from './error-codes.constants';

/** The Errors table of docs/contract/live-qc-api.md; the filter and the OpenAPI document both read it. */
export const DOMAIN_ERROR_STATUS: Record<ErrorCode, HttpStatus> = {
  [ErrorCode.SHOP_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.SHOP_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.BACKEND_SHOP_READ_ONLY]: HttpStatus.CONFLICT,
  [ErrorCode.FRAME_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.NO_PLATFORM_SELECTED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.BACKEND_NOT_CONNECTED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.BACKEND_LOGIN_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.STREAM_UNAVAILABLE]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.SHOPS_FILE_UNREADABLE]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.COOKIES_FILE_UNREADABLE]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.HOST_NOT_ALLOWED]: HttpStatus.FORBIDDEN,
  [ErrorCode.ORIGIN_NOT_ALLOWED]: HttpStatus.FORBIDDEN,
  [ErrorCode.BAD_REQUEST]: HttpStatus.BAD_REQUEST,
};
