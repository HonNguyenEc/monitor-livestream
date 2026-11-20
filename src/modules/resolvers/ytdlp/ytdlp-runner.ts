export interface YtDlpRunResult {
  /** Null when the process ended without an exit code (timeout kill or signal). */
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs yt-dlp with the given arguments; a real runner enforces `timeoutMs` and reports a timeout as a null exit code (the stub never runs yt-dlp). */
export interface YtDlpRunner {
  run(args: string[], timeoutMs: number): Promise<YtDlpRunResult>;
}

export const YTDLP_RUNNER = Symbol('YTDLP_RUNNER');
