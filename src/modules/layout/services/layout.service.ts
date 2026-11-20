import { Injectable } from '@nestjs/common';

import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { DetectionService } from '../../detection';
import { LayoutSettings, LayoutSettingsStore } from '../../settings';
import { DetectionStateStore } from '../../detection-state';
import { Channel, ChannelDirectory } from '../../shops';
import { LayoutSnapshotDto } from '../dtos/layout-snapshot.dto';
import { UpdateLayoutDto } from '../dtos/update-layout.dto';
import { layoutTiles } from '../utils/layout-tiles';
import { SAMPLE_GRID, SAMPLE_SCREEN } from '../fixtures/layout.fixtures';

@Injectable()
export class LayoutService {
  constructor(
    private readonly directory: ChannelDirectory,
    private readonly detectionStore: DetectionStateStore,
    private readonly settingsStore: LayoutSettingsStore,
    private readonly detection: DetectionService,
  ) {}

  async snapshot(): Promise<LayoutSnapshotDto> {
    const [channels, settings] = await Promise.all([
      this.directory.channels(),
      this.settingsStore.get(),
    ]);
    return this.toSnapshot(channels, settings);
  }

  private toSnapshot(channels: Channel[], settings: LayoutSettings): LayoutSnapshotDto {
    return {
      settings,
      screen: SAMPLE_SCREEN,
      area: SAMPLE_SCREEN,
      aspects: Object.values(AspectRatio),
      detectors: Object.values(Detector),
      ...SAMPLE_GRID,
      tiles: layoutTiles(channels, this.detectionStore, settings.live_only),
    };
  }

  // The channels are read first: a failing read must leave the settings untouched.
  async update(body: UpdateLayoutDto): Promise<LayoutSnapshotDto> {
    const channels = await this.directory.channels();
    const { previous, next: settings } = await this.settingsStore.update(body);
    if (previous.detector !== settings.detector || previous.show_mpv !== settings.show_mpv) {
      await this.detection.restartActive();
    }
    return this.toSnapshot(channels, settings);
  }
}
