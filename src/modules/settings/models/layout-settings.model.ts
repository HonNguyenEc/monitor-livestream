import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';

/** The content of mpv_layout.json, with the keys of the Python tool. */
export interface LayoutSettings {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rows: number;
  columns: number;
  gap: number;
  aspect: AspectRatio;
  live_only: boolean;
  ontop: boolean;
  detector: Detector;
  show_mpv: boolean;
}
