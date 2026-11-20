import { Injectable } from '@nestjs/common';

import { LayoutService } from '../../layout';
import { ChannelDirectory } from '../../shops';
import { WallRefreshResponseDto } from '../dtos/wall-refresh-response.dto';
import { WallResponseDto } from '../dtos/wall-response.dto';
import { SAMPLE_STREAM_URL } from '../constants/wall.constants';

@Injectable()
export class WallService {
  constructor(
    private readonly directory: ChannelDirectory,
    private readonly layoutService: LayoutService,
  ) {}

  async wall(): Promise<WallResponseDto> {
    const { settings, tiles } = await this.layoutService.snapshot();
    const { rows, columns, gap, aspect, live_only, detector } = settings;
    return {
      settings: { rows, columns, gap, aspect, live_only },
      detector,
      tiles: tiles.map((tile) => ({ ...tile, url: tile.live ? SAMPLE_STREAM_URL : null })),
    };
  }

  async refresh(key: string): Promise<WallRefreshResponseDto> {
    await this.directory.require(key);
    return { url: SAMPLE_STREAM_URL };
  }
}
