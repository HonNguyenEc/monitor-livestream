import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';

export class WallSettingsDto {
  /** 0 means chosen from the shop count. */
  rows: number;
  /** 0 means chosen from the shop count. */
  columns: number;
  gap: number;
  aspect: AspectRatio;
  live_only: boolean;
}
