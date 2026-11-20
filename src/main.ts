import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { LISTEN_HOST } from './common/constants/app.constants';
import { configureApp, createFastifyAdapter } from './app.setup';
import { SWAGGER_PATH } from './openapi/openapi.constants';
import { setupSwagger } from './openapi/openapi.document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter());
  const config = configureApp(app);
  setupSwagger(app, config.version);
  app.enableShutdownHooks();
  await app.listen(config.port, LISTEN_HOST);
  const baseUrl = `http://${LISTEN_HOST}:${config.port}`;
  Logger.log(`Live QC service on ${baseUrl}, Swagger at ${baseUrl}/${SWAGGER_PATH}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error('Bootstrap failed', (error as Error)?.stack, 'Bootstrap');
  process.exit(1);
});
