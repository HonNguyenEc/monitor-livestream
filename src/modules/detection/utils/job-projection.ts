import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { DetectionSnapshot, isJobRunning } from '../../detection-state';
import { VerdictState } from './verdict-reducer';

type JobFields = Pick<
  DetectionSnapshot,
  'jobState' | 'status' | 'reasonCode' | 'message' | 'checkedAt' | 'liveSince'
>;

/** The row fields a job in this state shows: the verdict while it runs, nothing checked otherwise (an `error` job reports `not_checked`). */
export function projectJob(jobState: JobState, verdict: VerdictState): JobFields {
  if (!isJobRunning({ jobState })) {
    return {
      jobState,
      status: LiveStatus.NOT_CHECKED,
      reasonCode: null,
      message: null,
      checkedAt: null,
      liveSince: null,
    };
  }
  return {
    jobState,
    status: verdict.status,
    reasonCode: verdict.reasonCode,
    message: null,
    checkedAt: verdict.checkedAt,
    liveSince: verdict.status === LiveStatus.LIVE ? verdict.liveSince : null,
  };
}
