import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { LayoutSettingsDto } from '../dtos/layout-settings.dto';
import { ScreenAreaDto } from '../dtos/screen-area.dto';

export const SAMPLE_LAYOUT_SETTINGS: LayoutSettingsDto = {
  enabled: true,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  rows: 0,
  columns: 0,
  gap: 4,
  aspect: AspectRatio.PORTRAIT,
  live_only: false,
  ontop: false,
  detector: Detector.MPV,
  show_mpv: true,
};

export const SAMPLE_GRID = { rows: 1, columns: 2 };

export const SAMPLE_SCREEN: ScreenAreaDto = { x: 0, y: 0, width: 1920, height: 1040 };
