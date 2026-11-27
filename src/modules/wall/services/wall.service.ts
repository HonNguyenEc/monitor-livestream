import { Injectable } from '@nestjs/common';

import { DetectionService } from '../../detection';
import { LayoutService } from '../../layout';
import { ChannelDirectory } from '../../shops';
import { WallRefreshResponseDto } from '../dtos/wall-refresh-response.dto';
import { WallResponseDto } from '../dtos/wall-response.dto';

@Injectable()
export class WallService {
  constructor(
    private readonly directory: ChannelDirectory,
    private readonly layoutService: LayoutService,
    private readonly detection: DetectionService,
  ) {}

  /** Reads only: the URL of a live tile is the one its job last resolved, never a new resolve. */
  async wall(): Promise<WallResponseDto> {
    const { settings, tiles } = await this.layoutService.snapshot();
    const { rows, columns, gap, aspect, live_only, detector } = settings;
    return {
      settings: { rows, columns, gap, aspect, live_only },
      detector,
      tiles: tiles.map((tile) => ({
        ...tile,
        url: tile.live ? this.detection.streamUrl(tile.key) : null,
      })),
    };
  }

  async refresh(key: string): Promise<WallRefreshResponseDto> {
    return { url: await this.detection.refreshStream(await this.directory.require(key)) };
  }
}
