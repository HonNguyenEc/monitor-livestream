import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { isPythonTruthy } from '../../../common/utils/python-values';
import {
  COORDINATE_RANGE,
  DEFAULT_LAYOUT_SETTINGS,
  GAP_RANGE,
  GRID_RANGE,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  PLAIN_NUMBER,
  SIZE_RANGE,
} from '../constants/layout-settings.constants';
import { LayoutSettings } from '../models/layout-settings.model';

type NumericField = 'x' | 'y' | 'width' | 'height' | 'rows' | 'columns' | 'gap';
type Range = { min: number; max: number };

const ASPECTS: readonly unknown[] = Object.values(AspectRatio);
const DETECTORS: readonly unknown[] = Object.values(Detector);

/** Python's int(float(value)): booleans and numeric strings count, anything else is not a number. */
function toInteger(value: unknown): number | null {
  const number =
    typeof value === 'boolean'
      ? Number(value)
      : typeof value === 'number'
        ? value
        : typeof value === 'string' && PLAIN_NUMBER.test(value.trim())
          ? Number(value.trim())
          : NaN;
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function clamp(data: Record<string, unknown>, name: NumericField, range: Range): number {
  const fallback = DEFAULT_LAYOUT_SETTINGS[name];
  const number = toInteger(data[name] ?? fallback);
  return number === null ? fallback : Math.min(range.max, Math.max(range.min, number));
}

function flag(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : isPythonTruthy(value);
}

/** clean_settings of livestream_qc/mpv_layout.py: every field clamped or reset to its default. */
export function cleanLayoutSettings(data: Record<string, unknown>): LayoutSettings {
  let width = clamp(data, 'width', SIZE_RANGE);
  let height = clamp(data, 'height', SIZE_RANGE);
  if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) {
    width = 0;
    height = 0;
  }
  return {
    enabled: flag(data.enabled, DEFAULT_LAYOUT_SETTINGS.enabled),
    x: clamp(data, 'x', COORDINATE_RANGE),
    y: clamp(data, 'y', COORDINATE_RANGE),
    width,
    height,
    rows: clamp(data, 'rows', GRID_RANGE),
    columns: clamp(data, 'columns', GRID_RANGE),
    gap: clamp(data, 'gap', GAP_RANGE),
    aspect: ASPECTS.includes(data.aspect)
      ? (data.aspect as AspectRatio)
      : DEFAULT_LAYOUT_SETTINGS.aspect,
    live_only: flag(data.live_only, DEFAULT_LAYOUT_SETTINGS.live_only),
    ontop: flag(data.ontop, DEFAULT_LAYOUT_SETTINGS.ontop),
    detector: DETECTORS.includes(data.detector)
      ? (data.detector as Detector)
      : DEFAULT_LAYOUT_SETTINGS.detector,
    show_mpv: flag(data.show_mpv, DEFAULT_LAYOUT_SETTINGS.show_mpv),
  };
}
