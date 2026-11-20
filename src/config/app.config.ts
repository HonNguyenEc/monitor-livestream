import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { registerAs } from '@nestjs/config';

import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_QC_PORT,
  MAX_PORT,
  MIN_PORT,
  PACKAGE_JSON_FILE,
  UNKNOWN_VERSION,
} from '../common/constants/app.constants';

export interface AppConfig {
  port: number;
  allowedOrigins: string[];
  version: string;
}

// Relative to this file (src/config or dist/config), so the service can start from any directory.
const PACKAGE_JSON_PATH = join(__dirname, '..', '..', PACKAGE_JSON_FILE);
const logger = new Logger('AppConfig');

function readPackageVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    if (typeof manifest.version === 'string') {
      return manifest.version;
    }
    logger.warn(`${PACKAGE_JSON_PATH} has no version; reporting ${UNKNOWN_VERSION}`);
  } catch (error) {
    logger.warn(
      `Cannot read ${PACKAGE_JSON_PATH} (${(error as Error).message}); reporting ${UNKNOWN_VERSION}`,
    );
  }
  return UNKNOWN_VERSION;
}

// An empty QC_PORT would become 0, which lets the OS pick a random port the admin cannot find.
function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_QC_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`QC_PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}, got "${raw}"`);
  }
  return port;
}

// Browsers send Origin lowercase and without a trailing slash; match that so a pasted URL still works.
function parseOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
  return origins.length > 0 ? origins : [DEFAULT_ALLOWED_ORIGINS];
}

export const appConfig = registerAs('app', (): AppConfig => ({
  port: parsePort(process.env.QC_PORT),
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  version: readPackageVersion(),
}));
