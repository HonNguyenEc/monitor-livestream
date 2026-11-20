import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppConfig, appConfig } from '../src/config/app.config';
import { OPENAPI_OUTPUT_FILE } from '../src/openapi/openapi.constants';
import { buildOpenApiDocument } from '../src/openapi/openapi.document';
import { createTestApp } from './helpers/create-test-app';
import { apiPath } from './helpers/http';

const CONTRACT_PATHS = [
  '/health',
  '/shops',
  '/shops/{key}',
  '/shops/{key}/detection/start',
  '/shops/{key}/detection/stop',
  '/shops/{key}/frame',
  '/monitor',
  '/monitor/start',
  '/monitor/stop',
  '/backend/status',
  '/backend/login',
  '/backend/logout',
  '/backend/sync',
  '/settings/layout',
  '/wall',
  '/wall/{key}/refresh',
];

describe('OpenAPI document (e2e)', () => {
  let app: NestFastifyApplication;
  let document: {
    paths: Record<string, unknown>;
    components: {
      schemas: Record<string, { properties: Record<string, Record<string, unknown>> }>;
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    const version = app.get<AppConfig>(appConfig.KEY).version;
    // Swagger UI pulls ESM assets Jest cannot load; the document is what the contract depends on.
    document = JSON.parse(JSON.stringify(buildOpenApiDocument(app, version)));
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every contract route', () => {
    expect(Object.keys(document.paths).sort()).toEqual(CONTRACT_PATHS.map(apiPath).sort());
  });

  it('matches the committed artifact, so npm run openapi:export was not forgotten', () => {
    const committed = JSON.parse(readFileSync(join(process.cwd(), OPENAPI_OUTPUT_FILE), 'utf8'));

    expect(document).toEqual(committed);
  });

  it('documents the app-wide 403 on every operation', () => {
    for (const pathItem of Object.values(document.paths) as Record<
      string,
      { responses: object }
    >[]) {
      for (const operation of Object.values(pathItem)) {
        expect(operation.responses).toHaveProperty('403');
      }
    }
  });

  it('describes DTO fields, enums and nullability', () => {
    const row = document.components.schemas.ShopRowDto.properties;

    expect(row.status.enum).toEqual([
      'live',
      'offline',
      'unknown',
      'no_signal',
      'checking',
      'not_checked',
    ]);
    expect(row.message.nullable).toBe(true);
    expect(document.components.schemas.ErrorResponseDto.properties.error).toBeDefined();
  });
});
