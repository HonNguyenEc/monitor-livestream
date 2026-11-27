import { Detector } from '../../../common/enums/detector.enum';
import { Channel } from '../../shops';

/** How a detector run ended; the job turns each into a verdict or a job state. */
export enum DetectorEnd {
  /** The job was stopped. */
  STOPPED = 'stopped',
  /** The stream opened but no frame arrived in time. */
  NO_SIGNAL = 'no_signal',
  /** Frames had been seen, then stopped: no verdict, the job resolves again. */
  LOST_FRAMES = 'lost_frames',
  TOOL_MISSING = 'tool_missing',
  PLAYER_FAILED = 'player_failed',
}

/** What a detector tells the job while it runs. */
export interface DetectorReport {
  /** The stream is open and the detector waits for its first frame. */
  checking(): void;
  /** A real frame was seen, so the channel is live. `hasImage` (default true) says whether `framePath` holds its picture now; false keeps the previous one. */
  frame(hasImage?: boolean): void;
}

export interface DetectorRun {
  channel: Channel;
  url: string;
  signal: AbortSignal;
  /** Where the latest frame goes. */
  framePath: string;
  report: DetectorReport;
}

/** One way to tell that a stream shows real frames. */
export interface FrameDetector {
  readonly kind: Detector;
  /** Whether the program it needs is installed; checked before every attempt, so a missing tool ends the job before any resolve. */
  available(): Promise<boolean>;
  /** Runs until the stream stops showing frames or the signal aborts; never throws for an expected outcome. */
  run(run: DetectorRun): Promise<DetectorEnd>;
}

export const FRAME_DETECTORS = Symbol('FRAME_DETECTORS');
