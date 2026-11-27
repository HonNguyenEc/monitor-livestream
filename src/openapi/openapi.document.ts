import { HttpStatus, INestApplication } from '@nestjs/common';
import { DocumentBuilder, getSchemaPath, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { ErrorCode } from '../common/constants/error-codes.constants';
import { ERROR_CODE_SEPARATOR } from '../common/decorators/api-domain-errors.decorator';
import { ErrorResponseDto } from '../common/dtos/error-response.dto';
import { OPENAPI_DESCRIPTION, OPENAPI_TITLE, SWAGGER_PATH } from './openapi.constants';

type PathItem = OpenAPIObject['paths'][string];
type Operation = NonNullable<PathItem['get']>;

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;
const LOCAL_REQUEST_ERRORS = [ErrorCode.HOST_NOT_ALLOWED, ErrorCode.ORIGIN_NOT_ALLOWED];
const VALIDATION_ERROR = HttpStatus[HttpStatus.BAD_REQUEST];

function addErrorResponse(operation: Operation, status: HttpStatus, description: string): void {
  const existing = operation.responses[status];
  operation.responses[status] =
    existing && 'description' in existing
      ? { ...existing, description: `${description}${ERROR_CODE_SEPARATOR}${existing.description}` }
      : {
          description,
          content: { 'application/json': { schema: { $ref: getSchemaPath(ErrorResponseDto) } } },
        };
}

// These errors come from app-wide checks, so every route can return them; declaring them per route would drift.
function addAppWideErrors(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      addErrorResponse(
        operation,
        HttpStatus.FORBIDDEN,
        LOCAL_REQUEST_ERRORS.join(ERROR_CODE_SEPARATOR),
      );
      if (operation.requestBody) {
        addErrorResponse(operation, HttpStatus.BAD_REQUEST, VALIDATION_ERROR);
      }
    }
  }
}

export function buildOpenApiDocument(app: INestApplication, version: string): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(OPENAPI_TITLE)
    .setDescription(OPENAPI_DESCRIPTION)
    .setVersion(version)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  addAppWideErrors(document);
  return document;
}

export function setupSwagger(
  app: INestApplication,
  version: string,
  customSwaggerUiPath?: string,
): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => buildOpenApiDocument(app, version), {
    customSwaggerUiPath,
  });
}
