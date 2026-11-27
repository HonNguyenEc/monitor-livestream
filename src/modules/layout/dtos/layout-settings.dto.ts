import { IsBoolean, IsEnum, IsInt, Min } from 'class-validator';

import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';

export class LayoutSettingsDto {
  /** Tile mpv windows into the grid; false leaves each window where mpv opens it. */
  @IsBoolean()
  enabled: boolean;

  @IsInt()
  x: number;

  @IsInt()
  y: number;

  /** 0 for width or height means the full screen work area. */
  @IsInt()
  @Min(0)
  width: number;

  /** 0 for width or height means the full screen work area. */
  @IsInt()
  @Min(0)
  height: number;

  /** 0 means chosen from the shop count. */
  @IsInt()
  @Min(0)
  rows: number;

  /** 0 means chosen from the shop count. */
  @IsInt()
  @Min(0)
  columns: number;

  @IsInt()
  @Min(0)
  gap: number;

  @IsEnum(AspectRatio)
  aspect: AspectRatio;

  @IsBoolean()
  live_only: boolean;

  @IsBoolean()
  ontop: boolean;

  @IsEnum(Detector)
  detector: Detector;

  @IsBoolean()
  show_mpv: boolean;
}
