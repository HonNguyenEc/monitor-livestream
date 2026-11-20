import { LiveStatus } from '../../../common/enums/live-status.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { LIVE_GRACE_MISSES } from '../constants/detection.constants';

/** What one attempt found out about the channel. */
export interface Observation {
  status: LiveStatus.LIVE | LiveStatus.OFFLINE | LiveStatus.UNKNOWN | LiveStatus.NO_SIGNAL;
  reasonCode: ReasonCode | null;
}

export const LIVE_OBSERVATION: Observation = { status: LiveStatus.LIVE, reasonCode: null };

/** The verdict a job reports, with what the grace rule needs. */
export interface VerdictState {
  status: LiveStatus;
  reasonCode: ReasonCode | null;
  /** Consecutive attempts that were not live. */
  misses: number;
  liveSince: string | null;
  checkedAt: string | null;
}

export const NO_VERDICT: Readonly<VerdictState> = Object.freeze({
  status: LiveStatus.CHECKING,
  reasonCode: null,
  misses: 0,
  liveSince: null,
  checkedAt: null,
});

/**
 * Folds one attempt into the reported verdict: a live verdict resets the misses; every other one,
 * failed resolves included, is a miss, and a channel that was live keeps reporting live until its
 * second miss in a row (Python's LIVE_GRACE_ATTEMPTS).
 */
export function applyVerdict(
  previous: VerdictState,
  observation: Observation,
  nowMs: number,
): VerdictState {
  const checkedAt = new Date(nowMs).toISOString();
  if (observation.status === LiveStatus.LIVE) {
    const wasLive = previous.status === LiveStatus.LIVE;
    return {
      status: LiveStatus.LIVE,
      reasonCode: null,
      misses: 0,
      liveSince: wasLive && previous.liveSince ? previous.liveSince : checkedAt,
      checkedAt,
    };
  }
  const misses = previous.misses + 1;
  if (previous.status === LiveStatus.LIVE && misses < LIVE_GRACE_MISSES) {
    return { ...previous, misses, checkedAt };
  }
  return {
    status: observation.status,
    reasonCode: observation.reasonCode,
    misses,
    liveSince: null,
    checkedAt,
  };
}
