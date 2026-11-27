import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import { DOMAIN_ERROR_STATUS } from '../constants/domain-error-status.constants';
import { ErrorCode } from '../constants/error-codes.constants';
import { ErrorResponseDto } from '../dtos/error-response.dto';

export const ERROR_CODE_SEPARATOR = ' or ';

/** Documents the domain errors a route can return, with the status the exception filter sends. */
export function ApiDomainErrors(...codes: ErrorCode[]): MethodDecorator & ClassDecorator {
  const byStatus = new Map<HttpStatus, ErrorCode[]>();
  for (const code of codes) {
    const status = DOMAIN_ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return applyDecorators(
    ...[...byStatus].map(([status, group]) =>
      ApiResponse({
        status,
        type: ErrorResponseDto,
        description: group.join(ERROR_CODE_SEPARATOR),
      }),
    ),
  );
}
