import { ApiProperty } from '@nestjs/swagger';

import { ERROR_BODY_CODES } from '../constants/error-codes.constants';

export class ErrorBodyDto {
  /** Stable machine-readable code, e.g. SHOP_NOT_FOUND. */
  @ApiProperty({ enum: ERROR_BODY_CODES, enumName: 'ErrorCode' })
  code: string;
  message: string;
  request_id: string;
}
