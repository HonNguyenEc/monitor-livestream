import { randomUUID } from 'node:crypto';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { API_PREFIX, CORS_METHODS } from './common/constants/app.constants';
import { localRequestHook } from './common/hooks/local-request.hook';
import { AppConfig, appConfig } from './config/app.config';

export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({ genReqId: () => randomUUID() });
}

/** Adapter-level setup shared by main.ts, export-openapi.ts and the e2e tests. */
export function configureApp(app: NestFastifyApplication): AppConfig {
  const config = app.get<AppConfig>(appConfig.KEY);
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({ origin: config.allowedOrigins, methods: CORS_METHODS });
  app.getHttpAdapter().getInstance().addHook('onRequest', localRequestHook(config.allowedOrigins));
  return config;
}
