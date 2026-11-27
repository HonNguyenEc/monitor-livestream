import { Module } from '@nestjs/common';

import { BackendModule } from '../backend';
import { DetectionStateModule } from '../detection-state';
import { PlayersModule } from '../players';
import { ProcessesModule } from '../processes';
import { ResolversModule } from '../resolvers';
import { SettingsModule } from '../settings';
import { ShopsModule } from '../shops';
import { DetectionController } from './controllers/detection.controller';
import { FfmpegFrameDetector } from './detectors/ffmpeg-frame.detector';
import { FfmpegFrameGrabber } from './detectors/ffmpeg-frame-grabber';
import { FRAME_DETECTORS } from './detectors/frame-detector.interface';
import { MpvFrameDetector } from './detectors/mpv-frame.detector';
import { DetectionJobManager } from './services/detection-job.manager';
import { DetectionService } from './services/detection.service';
import { StreamRefresher } from './services/stream-refresher';

@Module({
  imports: [
    ShopsModule,
    BackendModule,
    DetectionStateModule,
    SettingsModule,
    ResolversModule,
    ProcessesModule,
    PlayersModule,
  ],
  controllers: [DetectionController],
  providers: [
    DetectionService,
    DetectionJobManager,
    StreamRefresher,
    FfmpegFrameGrabber,
    FfmpegFrameDetector,
    MpvFrameDetector,
    {
      provide: FRAME_DETECTORS,
      useFactory: (mpv: MpvFrameDetector, ffmpeg: FfmpegFrameDetector) => [mpv, ffmpeg],
      inject: [MpvFrameDetector, FfmpegFrameDetector],
    },
  ],
  exports: [DetectionService],
})
export class DetectionModule {}
