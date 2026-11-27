import { Injectable, Logger } from '@nestjs/common';

import { replaceFileWith } from '../../../common/fs/replace-file-with';
import { fsErrorSummary } from '../../../common/fs/fs-error';
import { ExternalTool } from '../../../common/process/external-tool';
import { RunResult, runHidden } from '../../../common/process/hidden-process';
import { PROCESS_SUCCESS_EXIT_CODE } from '../../../common/process/process.constants';
import { safeError } from '../../../common/utils/safe-error';
import { ToolLocator } from '../../processes';
import { IMAGE_CHECK_MS } from '../constants/detection.constants';
import { FFMPEG_LOG_CONTEXT, STDERR_LOG_CHARS, ffmpegFrameArgs } from './ffmpeg.constants';

export enum GrabOutcome {
  FRAME = 'frame',
  NO_FRAME = 'no_frame',
  TOOL_MISSING = 'tool_missing',
}

/** Grabs one frame of a stream with FFmpeg into a file, so a reader never sees half a JPEG. */
@Injectable()
export class FfmpegFrameGrabber {
  private readonly logger = new Logger(FFMPEG_LOG_CONTEXT);

  constructor(private readonly tools: ToolLocator) {}

  async available(): Promise<boolean> {
    return (await this.tools.find(ExternalTool.FFMPEG)) !== null;
  }

  async grab(url: string, destination: string, signal: AbortSignal): Promise<GrabOutcome> {
    const binary = await this.tools.find(ExternalTool.FFMPEG);
    if (!binary) return GrabOutcome.TOOL_MISSING;
    let broken = false;
    try {
      const made = await replaceFileWith(destination, async (temp) => {
        const run = await runHidden(binary, ffmpegFrameArgs(url, temp), {
          timeoutMs: IMAGE_CHECK_MS,
          signal,
        });
        if (run.exitCode === PROCESS_SUCCESS_EXIT_CODE || signal.aborted) return !signal.aborted;
        broken = run.startError !== undefined;
        this.logFailure(run, broken);
        return false;
      });
      if (broken) return GrabOutcome.TOOL_MISSING;
      return made ? GrabOutcome.FRAME : GrabOutcome.NO_FRAME;
    } catch (error) {
      this.logger.warn(`No frame: ${fsErrorSummary(error)}`);
      return GrabOutcome.NO_FRAME;
    }
  }

  /** A broken binary is a warning; a stream that ffmpeg could not read is routine, and its reason is only for the log. */
  private logFailure(run: RunResult, broken: boolean): void {
    const text = `ffmpeg ${broken ? 'could not run' : 'got no frame'}: exit ${run.exitCode}, timed out ${run.timedOut}, ${safeError(run.stderr).slice(-STDERR_LOG_CHARS)}`;
    if (broken) this.logger.warn(text);
    else this.logger.log(text);
  }
}
