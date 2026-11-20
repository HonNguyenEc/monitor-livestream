import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';

export class WallSettingsDto {
  /** Saved layout value; 0 means the wall picks it from its own viewport, unlike the mpv grid. */
  rows: number;
  /** Saved layout value; 0 means the wall picks it from its own viewport, unlike the mpv grid. */
  columns: number;
  gap: number;
  aspect: AspectRatio;
  live_only: boolean;
}
