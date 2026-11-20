import { Injectable } from '@nestjs/common';

import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { ShopsService } from '../../shops/services/shops.service';
import { LayoutSettingsDto } from '../dtos/layout-settings.dto';
import { LayoutSnapshotDto } from '../dtos/layout-snapshot.dto';
import { UpdateLayoutDto } from '../dtos/update-layout.dto';
import { SAMPLE_GRID, SAMPLE_LAYOUT_SETTINGS, SAMPLE_SCREEN } from '../fixtures/layout.fixtures';

@Injectable()
export class LayoutService {
  private settings: LayoutSettingsDto = SAMPLE_LAYOUT_SETTINGS;

  constructor(private readonly shopsService: ShopsService) {}

  snapshot(): LayoutSnapshotDto {
    return {
      settings: this.settings,
      screen: SAMPLE_SCREEN,
      area: SAMPLE_SCREEN,
      aspects: Object.values(AspectRatio),
      detectors: Object.values(Detector),
      ...SAMPLE_GRID,
      tiles: this.shopsService.list().items.map((shop) => ({
        key: shop.key,
        label: shop.label,
        live: shop.status === LiveStatus.LIVE,
        visible: true,
      })),
    };
  }

  update(body: UpdateLayoutDto): LayoutSnapshotDto {
    this.settings = { ...this.settings, ...body };
    return this.snapshot();
  }
}
