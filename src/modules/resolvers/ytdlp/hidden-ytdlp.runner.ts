import { Injectable } from '@nestjs/common';

import { Semaphore } from '../../../common/concurrency/semaphore';
import { withTimeout } from '../../../common/concurrency/with-timeout';
import { ExternalTool } from '../../../common/process/external-tool';
import { runHidden } from '../../../common/process/hidden-process';
import { ToolLocator } from '../../processes';
import {
  YTDLP_MAX_CONCURRENT,
  YTDLP_UNAVAILABLE_EXIT_CODE,
  YTDLP_UNAVAILABLE_MESSAGE,
} from './ytdlp.constants';
import { YtDlpRunner, YtDlpRunResult } from './ytdlp-runner';

const KILLED: Omit<YtDlpRunResult, 'timedOut'> = { exitCode: null, stdout: '', stderr: '' };

/** Runs the yt-dlp binary hidden, a few at a time; `timeoutMs` counts from the call, so time spent waiting for a slot is part of it. */
@Injectable()
export class HiddenYtDlpRunner implements YtDlpRunner {
  private readonly slots = new Semaphore(YTDLP_MAX_CONCURRENT);

  constructor(private readonly tools: ToolLocator) {}

  async run(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<YtDlpRunResult> {
    const startedAtMs = Date.now();
    const release = await this.slots.acquire(withTimeout(timeoutMs, signal));
    if (!release) return { ...KILLED, timedOut: !signal?.aborted };
    try {
      const binary = await this.tools.find(ExternalTool.YTDLP);
      if (!binary) {
        return {
          exitCode: YTDLP_UNAVAILABLE_EXIT_CODE,
          stdout: '',
          stderr: YTDLP_UNAVAILABLE_MESSAGE,
          timedOut: false,
        };
      }
      const leftMs = timeoutMs - (Date.now() - startedAtMs);
      if (leftMs <= 0) return { ...KILLED, timedOut: true };
      return await runHidden(binary, args, { timeoutMs: leftMs, signal });
    } finally {
      release();
    }
  }
}
