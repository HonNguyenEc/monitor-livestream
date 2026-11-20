import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { LayoutSettings } from '../models/layout-settings.model';

export const LAYOUT_FILE = 'mpv_layout.json';
// The Python tool writes mpv_layout.json with indent=2.
export const LAYOUT_FILE_INDENT = 2;
export const msgNotJsonObject = (file: string): string => `${file} is not a JSON object`;

/** Same values as DEFAULTS in livestream_qc/mpv_layout.py. */
export const DEFAULT_LAYOUT_SETTINGS: Readonly<LayoutSettings> = Object.freeze({
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
});

export const COORDINATE_RANGE = { min: -20000, max: 20000 };
export const SIZE_RANGE = { min: 0, max: 20000 };
export const GRID_RANGE = { min: 0, max: 12 };
export const GAP_RANGE = { min: 0, max: 100 };
/** A width under the first or a height under the second is unusable; both sizes then reset to 0 (the full work area). */
export const MIN_WINDOW_WIDTH = 200;
export const MIN_WINDOW_HEIGHT = 150;

export const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
