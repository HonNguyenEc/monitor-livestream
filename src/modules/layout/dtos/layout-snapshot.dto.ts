import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { LayoutSettingsDto } from './layout-settings.dto';
import { LayoutTileDto } from './layout-tile.dto';
import { ScreenAreaDto } from './screen-area.dto';

export class LayoutSnapshotDto {
  settings: LayoutSettingsDto;
  screen: ScreenAreaDto;
  area: ScreenAreaDto;
  aspects: AspectRatio[];
  detectors: Detector[];
  rows: number;
  columns: number;
  tiles: LayoutTileDto[];
}
