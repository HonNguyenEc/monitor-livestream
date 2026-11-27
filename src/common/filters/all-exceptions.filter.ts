import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { DOMAIN_ERROR_STATUS } from '../constants/domain-error-status.constants';
import { DomainException } from '../exceptions/domain.exception';
import { errorResponse } from './error-response';
import { INTERNAL_ERROR_MESSAGE, MESSAGE_SEPARATOR } from '../constants/http.constants';

interface ErrorDescription {
  status: number;
  code: string;
  message: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const { status, code, message } = this.describe(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.url} failed`, (exception as Error)?.stack);
    }
    reply.status(status).send(errorResponse(code, message, String(request.id)));
  }

  private describe(exception: unknown): ErrorDescription {
    if (exception instanceof DomainException) {
      return {
        status: DOMAIN_ERROR_STATUS[exception.code],
        code: exception.code,
        message: exception.message,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: HttpStatus[status] ?? String(status),
        message: this.messageOf(exception),
      };
    }
    // Unexpected errors never leak internals to the client.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR],
      message: INTERNAL_ERROR_MESSAGE,
    };
  }

  private messageOf(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    const message = (response as { message?: unknown }).message;
    if (Array.isArray(message)) {
      return message.join(MESSAGE_SEPARATOR);
    }
    return typeof message === 'string' ? message : exception.message;
  }
}
