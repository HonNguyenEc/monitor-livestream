import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { IDLE_DETECTION } from '../models/detection-snapshot.model';
import { DetectionStateStore } from './detection-state.store';

describe('DetectionStateStore', () => {
  let store: DetectionStateStore;

  beforeEach(() => {
    store = new DetectionStateStore();
  });

  it('reports the idle state for a key without a job', () => {
    expect(store.get('a')).toEqual(IDLE_DETECTION);
    expect(store.has('a')).toBe(false);
  });

  it('merges changes into the snapshot and keeps the other keys apart', () => {
    store.update('a', { jobState: JobState.RETRYING, attempts: 1 });
    store.update('a', { status: LiveStatus.LIVE });
    store.update('b', { attempts: 5 });

    expect(store.get('a')).toEqual({
      ...IDLE_DETECTION,
      jobState: JobState.RETRYING,
      attempts: 1,
      status: LiveStatus.LIVE,
    });
    expect(store.get('b').attempts).toBe(5);
    expect(store.keys()).toEqual(['a', 'b']);
  });

  it('forgets a deleted key and keeps the others', () => {
    store.update('a', { attempts: 1 });
    store.update('b', { attempts: 1 });

    store.delete('a');

    expect(store.get('a')).toEqual(IDLE_DETECTION);
    expect(store.keys()).toEqual(['b']);
  });

  it('never lets a caller change the shared idle snapshot', () => {
    expect(Object.isFrozen(store.get('missing'))).toBe(true);
  });
});
