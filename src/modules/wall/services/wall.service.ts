import { Injectable } from '@nestjs/common';

import { LayoutService } from '../../layout/services/layout.service';
import { ShopsService } from '../../shops/services/shops.service';
import { WallRefreshResponseDto } from '../dtos/wall-refresh-response.dto';
import { WallResponseDto } from '../dtos/wall-response.dto';

const SAMPLE_STREAM_URL = 'https://example.com/live/sample.flv';

@Injectable()
export class WallService {
  constructor(
    private readonly shopsService: ShopsService,
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
    await this.shopsService.assertExists(key);
    return { url: SAMPLE_STREAM_URL };
  }
}
