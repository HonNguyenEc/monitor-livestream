import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from '../app.module';
import { configureApp, createFastifyAdapter } from '../app.setup';
import { FATAL_EXIT_CODE } from '../common/constants/app.constants';
import { JSON_INDENT, OPENAPI_OUTPUT_FILE } from './openapi.constants';
import { buildOpenApiDocument } from './openapi.document';

/** Writes the contract artifact the admin app generates its API types from. */
async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    logger: false,
  });
  const config = configureApp(app);
  const document = buildOpenApiDocument(app, config.version);
  const target = join(process.cwd(), OPENAPI_OUTPUT_FILE);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, JSON_INDENT)}\n`, 'utf8');
  await app.close();
}

exportOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exit(FATAL_EXIT_CODE);
});
