import { Injectable } from '@nestjs/common';

import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { ShopRowDto } from '../../shops/dtos/shop-row.dto';
import { ShopsService } from '../../shops/services/shops.service';
import { LayoutSettingsDto } from '../dtos/layout-settings.dto';
import { LayoutSnapshotDto } from '../dtos/layout-snapshot.dto';
import { UpdateLayoutDto } from '../dtos/update-layout.dto';
import { SAMPLE_GRID, SAMPLE_LAYOUT_SETTINGS, SAMPLE_SCREEN } from '../fixtures/layout.fixtures';

@Injectable()
export class LayoutService {
  private settings: LayoutSettingsDto = SAMPLE_LAYOUT_SETTINGS;

  constructor(private readonly shopsService: ShopsService) {}

  async snapshot(): Promise<LayoutSnapshotDto> {
    const { items } = await this.shopsService.list();
    return this.toSnapshot(items);
  }

  private toSnapshot(items: ShopRowDto[]): LayoutSnapshotDto {
    return {
      settings: this.settings,
      screen: SAMPLE_SCREEN,
      area: SAMPLE_SCREEN,
      aspects: Object.values(AspectRatio),
      detectors: Object.values(Detector),
      ...SAMPLE_GRID,
      tiles: items.map((shop) => ({
        key: shop.key,
        label: shop.label,
        live: shop.status === LiveStatus.LIVE,
        visible: true,
      })),
    };
  }

  // The shop list is read first: a failing read must leave the settings untouched.
  async update(body: UpdateLayoutDto): Promise<LayoutSnapshotDto> {
    const { items } = await this.shopsService.list();
    this.settings = { ...this.settings, ...body };
    return this.toSnapshot(items);
  }
}
