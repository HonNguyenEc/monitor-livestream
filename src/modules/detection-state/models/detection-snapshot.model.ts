import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';

/** What detection knows about one channel right now. */
export interface DetectionSnapshot {
  status: LiveStatus;
  jobState: JobState;
  attempts: number;
  reasonCode: ReasonCode | null;
  message: string | null;
  checkedAt: string | null;
  liveSince: string | null;
  /** Latest captured frame on disk; null until one exists. */
  framePath: string | null;
  /** When that frame was written (ms); versions the frame URL. */
  frameAtMs: number | null;
}

/** A channel without a job: not checked, stopped. */
export const IDLE_DETECTION: Readonly<DetectionSnapshot> = Object.freeze({
  status: LiveStatus.NOT_CHECKED,
  jobState: JobState.STOPPED,
  attempts: 0,
  reasonCode: null,
  message: null,
  checkedAt: null,
  liveSince: null,
  framePath: null,
  frameAtMs: null,
});
