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
import { DIGITS } from '../common/constants/patterns.constants';
import { PROJECT_ROOT } from './runtime-paths';

export interface AppConfig {
  port: number;
  allowedOrigins: string[];
  version: string;
}

// Injected by the packaging bundle, which has no package.json next to the executable.
declare const BUNDLED_VERSION: string | undefined;

const PACKAGE_JSON_PATH = join(PROJECT_ROOT, PACKAGE_JSON_FILE);
const logger = new Logger('AppConfig');

function readPackageVersion(): string {
  if (typeof BUNDLED_VERSION === 'string') {
    return BUNDLED_VERSION;
  }
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

// A blank QC_PORT (an empty line in .env) falls back to the default instead of failing the range check.
function parsePort(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) {
    return DEFAULT_QC_PORT;
  }
  const port = Number(value);
  // Number() also reads "1e3" and "0x1F", so a typo would bind a port nobody configured.
  if (!DIGITS.test(value) || port < MIN_PORT || port > MAX_PORT) {
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
