import { Injectable } from '@nestjs/common';

import { withTimeout } from '../../../common/concurrency/with-timeout';
import { readCapped } from '../../../common/http/get-json';
import { DIGITS } from '../../../common/constants/patterns.constants';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { safeError } from '../../../common/utils/safe-error';
import {
  ACCEPT_JSON_HEADERS,
  AUTHORIZATION_HEADER,
  BACKEND_TIMEOUT_MS,
  BEARER_SCHEME,
  CONTENT_TYPE_HEADER,
  JSON_CONTENT_TYPE,
  MAX_BACKEND_RESPONSE_BYTES,
  MAX_REMOTE_MESSAGE_LENGTH,
  MSG_BACKEND_ANSWER_TOO_LARGE,
  MSG_NO_ANSWER,
  NO_HTTP_STATUS,
  RETRY_AFTER_HEADER,
  VALIDATION_SEPARATOR,
} from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { textOf } from '../utils/backend-values';

type BackendMethod = 'GET' | 'POST';

interface BackendRequestOptions {
  body?: unknown;
  token?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

// A signal alone is the caller's whole budget and is not cut to the default timeout; the default applies when nothing else bounds the request.
function requestSignal({ timeoutMs, signal }: BackendRequestOptions): AbortSignal {
  if (signal && timeoutMs === undefined) return signal;
  return withTimeout(timeoutMs ?? BACKEND_TIMEOUT_MS, signal);
}

/**
 * JSON over HTTP to livestream-backend: error text and Retry-After are read as in `_http` of
 * livestream_qc/backend_client.py. Unlike it, an empty or non-JSON body gives `undefined`, and a
 * redirect is an error, so the password or refresh token in a POST body is never re-sent elsewhere.
 */
@Injectable()
export class BackendHttpClient {
  /** Throws BackendRequestError: NO_HTTP_STATUS when the backend does not answer, the non-2xx status, or BackendAnswerError (502) for a 2xx body over the size cap. */
  async request(
    method: BackendMethod,
    url: string,
    options: BackendRequestOptions = {},
  ): Promise<unknown> {
    let response: Response;
    let text: string | null;
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders(options),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'manual',
        signal: requestSignal(options),
      });
      text = await readCapped(response, MAX_BACKEND_RESPONSE_BYTES);
    } catch (error) {
      throw new BackendRequestError(MSG_NO_ANSWER, NO_HTTP_STATUS, '', null, {
        cause: error,
      });
    }
    if (text === null && response.ok) {
      throw new BackendAnswerError(MSG_BACKEND_ANSWER_TOO_LARGE);
    }
    const payload = parseJson(text ?? '');
    if (!response.ok) {
      throw new BackendRequestError(
        `Backend answered ${response.status}`,
        response.status,
        remoteMessage(payload),
        retryAfterSeconds(response.headers.get(RETRY_AFTER_HEADER)),
      );
    }
    return payload;
  }
}

function requestHeaders(options: BackendRequestOptions): Record<string, string> {
  const headers: Record<string, string> = { ...ACCEPT_JSON_HEADERS };
  if (options.body !== undefined) {
    headers[CONTENT_TYPE_HEADER] = JSON_CONTENT_TYPE;
  }
  if (options.token) {
    headers[AUTHORIZATION_HEADER] = `${BEARER_SCHEME} ${options.token}`;
  }
  return headers;
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function retryAfterSeconds(header: string | null): number | null {
  return header && DIGITS.test(header) ? Number(header) : null;
}

// FastAPI sends `detail` as a string, an object, or a list of validation errors.
function remoteMessage(payload: unknown): string {
  if (!isPlainObject(payload)) {
    return '';
  }
  const message = detailText(payload.detail) || textOf(payload.message);
  return safeError(message).slice(0, MAX_REMOTE_MESSAGE_LENGTH);
}

function detailText(detail: unknown): string {
  if (isPlainObject(detail)) {
    return textOf(detail.message) || textOf(detail.error) || JSON.stringify(detail);
  }
  if (Array.isArray(detail)) {
    return detail
      .filter(isPlainObject)
      .map((item) => textOf(item.msg) || JSON.stringify(item))
      .join(VALIDATION_SEPARATOR);
  }
  return textOf(detail);
}
