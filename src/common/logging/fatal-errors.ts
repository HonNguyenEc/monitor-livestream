import { Logger } from '@nestjs/common';

import {
  FATAL_EXIT_CODE,
  FATAL_LOG_CONTEXT,
  UNCAUGHT_EXCEPTION_MESSAGE,
  UNHANDLED_REJECTION_MESSAGE,
} from '../constants/app.constants';

export function logFatalAndExit(message: string, error: unknown): never {
  Logger.error(message, error instanceof Error ? error.stack : String(error), FATAL_LOG_CONTEXT);
  process.exit(FATAL_EXIT_CODE);
}

// Node's own fatal-error printer writes to the native stderr handle, bypassing the
// process.stderr.write redirect, so without these a crash leaves nothing in the log file.
export function logFatalErrors(): void {
  process.on('uncaughtException', (error) => logFatalAndExit(UNCAUGHT_EXCEPTION_MESSAGE, error));
  process.on('unhandledRejection', (reason) =>
    logFatalAndExit(UNHANDLED_REJECTION_MESSAGE, reason),
  );
}
