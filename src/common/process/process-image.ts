import { Logger } from '@nestjs/common';

import { safeError } from '../utils/safe-error';
import { runHidden } from './hidden-process';
import {
  POWERSHELL_EXE,
  PROCESS_QUERY_ERROR_EXCERPT,
  PROCESS_QUERY_LOG_CONTEXT,
  PROCESS_QUERY_TIMEOUT_MS,
  processQueryArgs,
} from './process.constants';

const logger = new Logger(PROCESS_QUERY_LOG_CONTEXT);

export interface RunningProcess {
  pid: number;
  /** Executable file name in lower case. */
  image: string;
  /** Creation time, ms since the epoch. */
  createdMs: number;
}

/** The processes in the JSON a pid query printed, or null when the text is not a list of them; an empty text is not an answer, `[]` is. */
export function parseProcessList(output: string): RunningProcess[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const found: RunningProcess[] = [];
  for (const row of parsed as Array<Record<string, unknown>>) {
    const { pid, name, createdMs } = row ?? {};
    if (!Number.isInteger(pid) || typeof name !== 'string' || !Number.isFinite(createdMs)) {
      return null;
    }
    found.push({ pid: pid as number, image: name.toLowerCase(), createdMs: createdMs as number });
  }
  return found;
}

/**
 * Which of `pids` run right now, in one query; a pid that is not in the answer is not running. Null
 * when the question could not be answered (not Windows, the query failed or timed out): an unknown
 * answer must never be read as "not running".
 */
export async function inspectProcesses(pids: readonly number[]): Promise<RunningProcess[] | null> {
  if (process.platform !== 'win32') return null;
  if (pids.length === 0) return [];
  const { exitCode, stdout, stderr, timedOut } = await runHidden(
    POWERSHELL_EXE,
    processQueryArgs(pids),
    { timeoutMs: PROCESS_QUERY_TIMEOUT_MS },
  );
  const found = exitCode === 0 && !timedOut ? parseProcessList(stdout) : null;
  if (found === null) {
    logger.warn(
      `Process query failed: exit ${exitCode}${timedOut ? ', timed out' : ''}${stderr ? `, ${safeError(stderr).slice(-PROCESS_QUERY_ERROR_EXCERPT)}` : ''}`,
    );
  }
  return found;
}
