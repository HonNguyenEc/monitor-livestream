import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

import { LOCAL_HOSTNAMES, SAFE_METHODS } from '../constants/app.constants';
import { DOMAIN_ERROR_STATUS } from '../constants/domain-error-status.constants';
import { ErrorCode } from '../constants/error-codes.constants';
import { errorResponse } from '../filters/error-response';

/**
 * Loopback binding does not stop browser pages: a foreign Host means DNS rebinding, and a foreign
 * Origin on a write is CSRF, since simple requests skip the CORS preflight. A Fastify hook, not a
 * Nest guard, so it also covers Swagger and unmatched routes.
 */
export function localRequestHook(allowedOrigins: string[]): onRequestHookHandler {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    const refusal = refuse(request, allowedOrigins);
    if (!refusal) {
      done();
      return;
    }
    const [code, message] = refusal;
    void reply
      .status(DOMAIN_ERROR_STATUS[code])
      .send(errorResponse(code, message, String(request.id)));
  };
}

function refuse(request: FastifyRequest, allowedOrigins: string[]): [ErrorCode, string] | null {
  if (!LOCAL_HOSTNAMES.includes(request.hostname.toLowerCase())) {
    return [ErrorCode.HOST_NOT_ALLOWED, 'Requests must target localhost'];
  }
  const origin = request.headers.origin?.toLowerCase();
  if (
    origin &&
    !SAFE_METHODS.includes(request.method) &&
    !allowedOrigins.includes(origin) &&
    !isSameOrigin(request, origin)
  ) {
    return [ErrorCode.ORIGIN_NOT_ALLOWED, `Origin ${origin} is not allowed`];
  }
  return null;
}

// Pages served by this service itself (Swagger "Try it out") send their own origin; Host is already loopback here.
function isSameOrigin(request: FastifyRequest, origin: string): boolean {
  return origin === `${request.protocol}://${request.headers.host?.toLowerCase()}`;
}
