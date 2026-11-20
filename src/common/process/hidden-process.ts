import { ChildProcess, execFile, ExecFileOptions, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Logger } from '@nestjs/common';

import { fsErrorSummary } from '../fs/fs-error';
import {
  DEFAULT_MAX_OUTPUT_BYTES,
  EXIT_PIPE_GRACE_MS,
  HIDDEN_PROCESS_LOG_CONTEXT,
  KILL_GRACE_MS,
  KILL_TIMEOUT_MS,
  PROCESS_NOT_FOUND_ERRNO,
  TASKKILL_EXE,
  TASKKILL_NOT_FOUND_EXIT,
  taskkillArgs,
} from './process.constants';

const execFileAsync = promisify(execFile);
const logger = new Logger(HIDDEN_PROCESS_LOG_CONTEXT);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  /** Per stream; output past it is dropped. */
  maxOutputBytes?: number;
}

export interface RunResult {
  /** Null when the process was killed (timeout, abort) or could not start. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** True when the timeout, not the caller, ended it. */
  timedOut: boolean;
}

type OutputStream = 'stdout' | 'stderr';

// The packaged service is a GUI-subsystem process: a console child without windowsHide opens its own console.
export function spawnHidden(file: string, args: string[]): ChildProcess {
  const child = spawn(file, args, { stdio: 'ignore', windowsHide: true });
  // Without a listener a bad path becomes an uncaught exception that takes the service down.
  child.on('error', (error) => logger.warn(`Cannot run ${file}: ${fsErrorSummary(error)}`));
  return child;
}

export async function execFileHidden(
  file: string,
  args: string[],
  options: Omit<ExecFileOptions, 'windowsHide' | 'encoding'> = {},
): Promise<ExecResult> {
  return execFileAsync(file, args, { ...options, encoding: 'utf8', windowsHide: true });
}

/** Kills the process (and on Windows its whole tree, `taskkill /T`) and says whether that is confirmed: gone, or already gone. Never throws. */
export function killProcessTree(pid: number): Promise<boolean> {
  return new Promise((done) => {
    const settle = (confirmed: boolean, why: string): void => {
      if (!confirmed) logger.warn(`Kill of ${pid} not confirmed: ${why}`);
      done(confirmed);
    };
    if (process.platform !== 'win32') {
      try {
        process.kill(pid, 'SIGKILL');
        done(true);
      } catch (error) {
        const gone = (error as NodeJS.ErrnoException).code === PROCESS_NOT_FOUND_ERRNO;
        settle(gone, fsErrorSummary(error));
      }
      return;
    }
    const killer = spawn(TASKKILL_EXE, taskkillArgs(pid), {
      stdio: 'ignore',
      windowsHide: true,
      timeout: KILL_TIMEOUT_MS,
    });
    killer.on('error', (error) =>
      settle(false, `cannot run ${TASKKILL_EXE}: ${fsErrorSummary(error)}`),
    );
    killer.on('close', (code, signal) =>
      settle(code === 0 || code === TASKKILL_NOT_FOUND_EXIT, `exit ${code}, signal ${signal}`),
    );
  });
}

/** Runs a command to its end and reports how it ended; a non-zero exit, a timeout and a missing file are results, not throws. */
export function runHidden(file: string, args: string[], options: RunOptions): Promise<RunResult> {
  const { timeoutMs, signal, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES } = options;
  if (signal?.aborted) {
    return Promise.resolve({ exitCode: null, stdout: '', stderr: '', timedOut: false });
  }
  return new Promise((resolve) => {
    const chunks: Record<OutputStream, Buffer[]> = { stdout: [], stderr: [] };
    const sizes: Record<OutputStream, number> = { stdout: 0, stderr: 0 };
    let startError = '';
    let timedOut = false;
    let exited = false;
    let settled = false;
    let graceTimer: NodeJS.Timeout | undefined;

    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const truncated: Record<OutputStream, boolean> = { stdout: false, stderr: false };
    // A cut inside a character decodes to U+FFFD, which would put the text over the cap again.
    const text = (stream: OutputStream): string => {
      const decoded = Buffer.concat(chunks[stream]).toString('utf8');
      return truncated[stream] ? decoded.replace(/�$/, '') : decoded;
    };
    const cutPipes = (code: number | null): void => {
      child.stdout?.destroy();
      child.stderr?.destroy();
      finish(code);
    };
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      signal?.removeEventListener('abort', stop);
      resolve({
        exitCode,
        stdout: text('stdout'),
        stderr: text('stderr') || startError,
        timedOut,
      });
    };
    // Never kill a pid that already exited: Windows may have given it to another process.
    function stop(): void {
      if (settled || exited || child.pid === undefined) return;
      void killProcessTree(child.pid);
      // A grandchild that outlives the kill can keep the pipes open; do not wait for them.
      graceTimer = setTimeout(() => cutPipes(null), KILL_GRACE_MS);
    }
    const timer = setTimeout(() => {
      if (exited) return;
      timedOut = true;
      stop();
    }, timeoutMs);

    const collect = (stream: OutputStream): void => {
      child[stream]?.on('data', (chunk: Buffer) => {
        const room = maxOutputBytes - sizes[stream];
        if (chunk.byteLength > room) truncated[stream] = true;
        if (room <= 0) return;
        const piece = chunk.subarray(0, room);
        sizes[stream] += piece.byteLength;
        chunks[stream].push(piece);
      });
    };
    collect('stdout');
    collect('stderr');

    child.on('error', (error) => {
      startError = fsErrorSummary(error);
      finish(null);
    });
    child.on('exit', (code) => {
      exited = true;
      clearTimeout(graceTimer);
      // The pipes normally close with the process; if a grandchild holds them, do not wait for it.
      graceTimer = setTimeout(() => cutPipes(killed(code)), EXIT_PIPE_GRACE_MS);
    });
    child.on('close', (code) => finish(killed(code)));
    signal?.addEventListener('abort', stop, { once: true });

    function killed(code: number | null): number | null {
      return timedOut || signal?.aborted ? null : code;
    }
  });
}
