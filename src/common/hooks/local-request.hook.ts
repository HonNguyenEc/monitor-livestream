import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

import {
  LOCAL_HOSTNAMES,
  SAFE_METHODS,
  SEC_FETCH_CROSS_SITE,
  SEC_FETCH_SITE_HEADER,
} from '../constants/app.constants';
import { DOMAIN_ERROR_STATUS } from '../constants/domain-error-status.constants';
import { ErrorCode } from '../constants/error-codes.constants';
import { ErrorMessage } from '../constants/error-messages.constants';
import { errorResponse } from '../filters/error-response';

/**
 * Loopback binding does not stop browser pages: a foreign Host means DNS rebinding, a foreign
 * Origin on a write is CSRF (simple requests skip the CORS preflight), and a cross-site read
 * without an allowed Origin is a page probing the service (no-cors requests carry no Origin). A Fastify hook, not a
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
    return [ErrorCode.HOST_NOT_ALLOWED, ErrorMessage.hostNotAllowed];
  }
  const origin = request.headers.origin?.toLowerCase();
  const fromOtherSite = request.headers[SEC_FETCH_SITE_HEADER] === SEC_FETCH_CROSS_SITE;
  if (fromOtherSite && !(origin && allowedOrigins.includes(origin))) {
    return [ErrorCode.ORIGIN_NOT_ALLOWED, ErrorMessage.crossSiteNotAllowed];
  }
  if (
    origin &&
    !SAFE_METHODS.includes(request.method) &&
    !allowedOrigins.includes(origin) &&
    !isSameOrigin(request, origin)
  ) {
    return [ErrorCode.ORIGIN_NOT_ALLOWED, ErrorMessage.originNotAllowed(origin)];
  }
  return null;
}

// Pages served by this service itself (Swagger "Try it out") send their own origin; Host is already loopback here.
function isSameOrigin(request: FastifyRequest, origin: string): boolean {
  return origin === `${request.protocol}://${request.headers.host?.toLowerCase()}`;
}
