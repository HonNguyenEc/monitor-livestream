import { LayoutSettingsStore } from '../../settings';
import { DetectionStateStore } from '../../detection-state';
import { ResolverService } from '../../resolvers';
import { ChannelDirectory } from '../../shops';
import { FrameDetector } from '../detectors/frame-detector.interface';

/** What a job needs from the rest of the service; the manager builds it once and hands it to every job. */
export interface JobContext {
  store: DetectionStateStore;
  directory: ChannelDirectory;
  resolver: ResolverService;
  settings: LayoutSettingsStore;
  detectors: readonly FrameDetector[];
  /** The login epoch now; a backend channel's job ends when it differs from the one the job started under. */
  loginEpoch: () => number;
  framePathOf: (key: string) => string;
}
