import { JobState } from '../../../common/enums/job-state.enum';

export class DetectionStateDto {
  key: string;
  state: JobState;
  message: string | null;
}
