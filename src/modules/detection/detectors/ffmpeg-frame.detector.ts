import { Injectable } from '@nestjs/common';

import { abortableSleep } from '../../../common/concurrency/abortable-sleep';
import { Detector } from '../../../common/enums/detector.enum';
import { PLAYING_CHECK_MS } from '../constants/detection.constants';
import { FfmpegFrameGrabber, GrabOutcome } from './ffmpeg-frame-grabber';
import { DetectorEnd, DetectorRun, FrameDetector } from './frame-detector.interface';

/** `_probe` of mpv_retry.py: a frame grabbed every 30 s; no player stays connected to the stream. */
@Injectable()
export class FfmpegFrameDetector implements FrameDetector {
  readonly kind = Detector.FFMPEG;

  constructor(private readonly grabber: FfmpegFrameGrabber) {}

  available(): Promise<boolean> {
    return this.grabber.available();
  }

  async run({ url, signal, framePath, report }: DetectorRun): Promise<DetectorEnd> {
    report.checking();
    let seen = false;
    while (!signal.aborted) {
      const outcome = await this.grabber.grab(url, framePath, signal);
      if (signal.aborted) break;
      if (outcome === GrabOutcome.TOOL_MISSING) return DetectorEnd.TOOL_MISSING;
      if (outcome === GrabOutcome.NO_FRAME)
        return seen ? DetectorEnd.LOST_FRAMES : DetectorEnd.NO_SIGNAL;
      seen = true;
      report.frame();
      if (!(await abortableSleep(PLAYING_CHECK_MS, signal))) break;
    }
    return DetectorEnd.STOPPED;
  }
}
