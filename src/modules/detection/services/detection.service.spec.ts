import { JobState } from '../../../common/enums/job-state.enum';
import { DetectionControl, DetectionStateStore } from '../../detection-state';
import { LayoutSettingsStore } from '../../settings';
import { ChannelDirectory } from '../../shops';
import { DetectionService } from './detection.service';

describe('DetectionService', () => {
  const store = new DetectionStateStore();
  const control = new DetectionControl();
  const service = new DetectionService(
    {} as ChannelDirectory,
    store,
    {} as LayoutSettingsStore,
    control,
  );

  it('takes over the stop of a channel for modules that cannot depend on it', async () => {
    store.update('tiktok_a', { jobState: JobState.PLAYING });
    service.onModuleInit();

    await control.stop('tiktok_a');

    expect(store.has('tiktok_a')).toBe(false);
  });

  it('stops by key without looking the channel up', async () => {
    await expect(service.stop('gone')).resolves.toMatchObject({
      key: 'gone',
      state: JobState.STOPPED,
    });
  });
});
