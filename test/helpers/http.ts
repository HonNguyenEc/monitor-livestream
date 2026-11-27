import { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse } from 'fastify';

import { API_PREFIX } from '../../src/common/constants/app.constants';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export function apiPath(path: string): string {
  return `/${API_PREFIX}${path}`;
}

export function callApi(
  app: NestFastifyApplication,
  method: Method,
  path: string,
  payload?: object,
  headers?: Record<string, string>,
): Promise<LightMyRequestResponse> {
  return app.inject({ method, url: apiPath(path), payload, headers });
}

export function expectError(response: LightMyRequestResponse, status: number, code: string): void {
  expect(response.statusCode).toBe(status);
  expect(response.json()).toEqual({
    detail: expect.any(String),
    error: { code, message: expect.any(String), request_id: expect.any(String) },
  });
}
