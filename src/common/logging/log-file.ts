import { closeSync, fstatSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { ConsoleLogger } from '@nestjs/common';

import {
  LOG_FILE,
  LOG_FILE_LOG_CONTEXT,
  MAX_LOG_BYTES,
  ROTATED_LOG_SUFFIX,
} from '../constants/app.constants';

const APPEND_FLAG = 'a';

// Writes are synchronous so the error logged right before process.exit still reaches the file.
export class LogFile {
  private fd: number | null;
  private rotationEnabled = false;

  constructor(
    readonly path: string,
    private readonly maxBytes = MAX_LOG_BYTES,
  ) {
    this.fd = openSync(path, APPEND_FLAG);
  }

  write(chunk: string | Uint8Array): void {
    try {
      this.fd ??= openSync(this.path, APPEND_FLAG);
      writeSync(this.fd, typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      if (this.rotationEnabled && fstatSync(this.fd).size > this.maxBytes) {
        this.rotate(this.fd);
      }
    } catch {
      // stdout and stderr land here: a full disk or a locked log loses the line, not the service.
    }
  }

  // Only the instance that owns the port may rotate: a second instance shares the file until it
  // exits on EADDRINUSE and must not move the running service's log aside.
  enableRotation(): void {
    this.rotationEnabled = true;
  }

  // The next write reopens the file, so a failed open never leaves a closed descriptor in use.
  private rotate(fd: number): void {
    this.fd = null;
    closeSync(fd);
    try {
      renameSync(this.path, `${this.path}${ROTATED_LOG_SUFFIX}`);
    } catch {
      // A locked rotated file must not take the service down; the next write retries.
    }
  }
}

function openLogFile(logDir: string): LogFile {
  mkdirSync(logDir, { recursive: true });
  return new LogFile(join(logDir, LOG_FILE));
}

function redirectOutput(logFile: LogFile): void {
  const write = ((chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
    logFile.write(chunk);
    const callback = rest.find((arg): arg is () => void => typeof arg === 'function');
    callback?.();
    return true;
  }) as typeof process.stdout.write;
  process.stdout.write = write;
  process.stderr.write = write;
}

// The packaged executable has no console, so an unusable log folder must never stop the service:
// it falls back to fallbackLogDir, then to running without a log file.
export function redirectOutputToLogFile(
  logDir: string,
  fallbackLogDir: string,
): LogFile | undefined {
  try {
    const logFile = openLogFile(logDir);
    redirectOutput(logFile);
    return logFile;
  } catch (error) {
    try {
      const logFile = openLogFile(fallbackLogDir);
      redirectOutput(logFile);
      const reason = error instanceof Error ? error.message : String(error);
      new ConsoleLogger(LOG_FILE_LOG_CONTEXT, { colors: false }).warn(
        `Log folder ${logDir} is unusable (${reason}); logging to ${fallbackLogDir} instead`,
      );
      return logFile;
    } catch {
      return undefined;
    }
  }
}
