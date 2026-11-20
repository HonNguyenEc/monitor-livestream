import { Inject, Injectable, Logger } from '@nestjs/common';
import { safeErrorMessage } from '../../../common/utils/safe-error-message';
import { safeError } from '../../../common/utils/safe-error';
import { PROCESS_SUCCESS_EXIT_CODE } from '../../../common/process/process.constants';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { cancelled, failedRaw, resolved, ResolveResult } from '../models/resolve-result.model';
import {
  tiktokLiveUrl,
  YTDLP_ARGS,
  YTDLP_EXIT_FALLBACK_PREFIX,
  YTDLP_FAILED_EVENT,
  YTDLP_NO_EXIT_CODE_MESSAGE,
  YTDLP_TIMED_OUT_MESSAGE,
  YTDLP_SUCCESS_DETAIL,
} from './ytdlp.constants';
import { YTDLP_RUNNER, YtDlpRunner } from './ytdlp-runner';
import { HTTP_URL_PREFIXES } from '../../../common/constants/http.constants';

@Injectable()
export class YtDlpFallback {
  private readonly logger = new Logger(YtDlpFallback.name);

  constructor(@Inject(YTDLP_RUNNER) private readonly runner: YtDlpRunner) {}

  async resolve(username: string, timeoutMs: number, signal?: AbortSignal): Promise<ResolveResult> {
    if (signal?.aborted) return cancelled();
    const url = tiktokLiveUrl(username);
    let run;
    try {
      run = await this.runner.run([...YTDLP_ARGS, url], timeoutMs, signal);
    } catch (error) {
      return this.failure(safeErrorMessage(error));
    }
    if (signal?.aborted) return cancelled();
    const urls = run.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => HTTP_URL_PREFIXES.some((prefix) => line.startsWith(prefix)));
    if (run.exitCode === PROCESS_SUCCESS_EXIT_CODE && urls.length > 0) {
      return resolved(urls, YTDLP_SUCCESS_DETAIL);
    }
    if (run.timedOut) return this.failure(YTDLP_TIMED_OUT_MESSAGE);
    const exitText =
      run.exitCode === null
        ? YTDLP_NO_EXIT_CODE_MESSAGE
        : `${YTDLP_EXIT_FALLBACK_PREFIX} ${run.exitCode}`;
    const text = run.stderr || run.stdout || exitText;
    return this.failure(safeError(text));
  }

  private failure(detail: string): ResolveResult {
    this.logger.warn(`${YTDLP_FAILED_EVENT}: ${detail}`);
    return failedRaw(ResolveFailureCode.YTDLP_FAILED, detail);
  }
}
