import 'reflect-metadata';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isSea } from 'node:sea';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import {
  APP_DATA_FOLDER,
  BOOTSTRAP_FAILED_MESSAGE,
  BOOTSTRAP_LOG_CONTEXT,
  LISTEN_HOST,
  LOG_FOLDER,
} from './common/constants/app.constants';
import { logFatalAndExit, logFatalErrors } from './common/logging/fatal-errors';
import { redirectOutputToLogFile } from './common/logging/log-file';
import { configureApp, createFastifyAdapter } from './app.setup';
import { ChildProcessRegistry } from './modules/processes';
import { resolveDataDir } from './config/runtime-paths';
import { SWAGGER_PATH, SWAGGER_UI_FOLDER } from './openapi/openapi.constants';
import { setupSwagger } from './openapi/openapi.document';

async function bootstrap(): Promise<void> {
  const packaged = isSea();
  const logFile = packaged
    ? redirectOutputToLogFile(
        join(resolveDataDir(), LOG_FOLDER),
        join(tmpdir(), APP_DATA_FOLDER, LOG_FOLDER),
      )
    : undefined;
  if (packaged) {
    logFatalErrors();
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createFastifyAdapter(),
    packaged ? { logger: new ConsoleLogger({ colors: false }) } : {},
  );
  const config = configureApp(app);
  // The executable carries no node_modules; the installer ships Swagger UI next to it.
  const swaggerUiPath = packaged ? join(dirname(process.execPath), SWAGGER_UI_FOLDER) : undefined;
  setupSwagger(app, config.version, swaggerUiPath);
  app.enableShutdownHooks();
  await app.listen(config.port, LISTEN_HOST);
  // Only the instance that owns the port may kill what an earlier run left: a second launch must not touch the first one's players.
  await app.get(ChildProcessRegistry, { strict: false }).sweepOrphans();
  logFile?.enableRotation();
  const baseUrl = `http://${LISTEN_HOST}:${config.port}`;
  Logger.log(
    `Live QC service on ${baseUrl}, Swagger at ${baseUrl}/${SWAGGER_PATH}`,
    BOOTSTRAP_LOG_CONTEXT,
  );
}

bootstrap().catch((error: unknown) => logFatalAndExit(BOOTSTRAP_FAILED_MESSAGE, error));
