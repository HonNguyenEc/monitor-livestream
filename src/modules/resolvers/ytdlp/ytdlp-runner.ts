import { RunResult } from '../../../common/process/hidden-process';

/** The result of runHidden, so the real runner can return it as it is. */
export type YtDlpRunResult = RunResult;

/** Runs yt-dlp with the given arguments; a real runner enforces `timeoutMs`, kills yt-dlp when `signal` aborts, and reports a kill as a null exit code (`timedOut` for the timeout); the stub never runs yt-dlp. */
export interface YtDlpRunner {
  run(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<YtDlpRunResult>;
}

export const YTDLP_RUNNER = Symbol('YTDLP_RUNNER');
