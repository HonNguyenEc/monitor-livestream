import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';

import { ErrorCode } from '../constants/error-codes.constants';
import { DomainException } from '../exceptions/domain.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

const REQUEST_ID = 'req-1';

function capture(exception: unknown): { status: number; body: Record<string, unknown> } {
  const result = { status: 0, body: {} as Record<string, unknown> };
  const reply = {
    status(code: number) {
      result.status = code;
      return { send: (body: Record<string, unknown>) => (result.body = body) };
    },
  };
  const request = { id: REQUEST_ID, method: 'GET', url: '/x' };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return result;
}

describe('AllExceptionsFilter', () => {
  it('keeps the domain code and message', () => {
    const { status, body } = capture(
      new DomainException(ErrorCode.BACKEND_SHOP_READ_ONLY, 'Read-only shop'),
    );

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toEqual({
      detail: 'Read-only shop',
      error: { code: 'BACKEND_SHOP_READ_ONLY', message: 'Read-only shop', request_id: REQUEST_ID },
    });
  });

  // Mirrors the Errors table of docs/contract/live-qc-api.md.
  const CONTRACT_STATUS: Record<ErrorCode, HttpStatus> = {
    SHOP_NOT_FOUND: HttpStatus.NOT_FOUND,
    SHOP_ALREADY_EXISTS: HttpStatus.CONFLICT,
    BACKEND_SHOP_READ_ONLY: HttpStatus.CONFLICT,
    FRAME_NOT_FOUND: HttpStatus.NOT_FOUND,
    NO_PLATFORM_SELECTED: HttpStatus.BAD_REQUEST,
    BACKEND_NOT_CONNECTED: HttpStatus.BAD_REQUEST,
    BACKEND_LOGIN_FAILED: HttpStatus.BAD_REQUEST,
    STREAM_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
    HOST_NOT_ALLOWED: HttpStatus.FORBIDDEN,
    ORIGIN_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  };

  it.each(Object.entries(CONTRACT_STATUS))('maps %s to %i', (code, status) => {
    expect(capture(new DomainException(code as ErrorCode, 'x')).status).toBe(status);
  });

  it('uses the HTTP status name for framework exceptions', () => {
    const { body } = capture(new NotFoundException('Missing'));

    expect(body).toMatchObject({ error: { code: 'NOT_FOUND', message: 'Missing' } });
  });

  it('joins validation messages', () => {
    const { body } = capture(new BadRequestException(['a is empty', 'b is not a number']));

    expect(body).toMatchObject({ detail: 'a is empty, b is not a number' });
  });

  it('hides internals of unexpected errors', () => {
    const { status, body } = capture(new Error('connection string leaked'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(body)).not.toContain('leaked');
  });
});
