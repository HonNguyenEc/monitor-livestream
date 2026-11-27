import { AspectRatio } from '../../../common/enums/aspect-ratio.enum';
import { Detector } from '../../../common/enums/detector.enum';
import { DEFAULT_LAYOUT_SETTINGS } from '../constants/layout-settings.constants';
import { cleanLayoutSettings } from './clean-layout-settings';

describe('cleanLayoutSettings', () => {
  it('turns an empty object into the defaults', () => {
    expect(cleanLayoutSettings({})).toEqual(DEFAULT_LAYOUT_SETTINGS);
  });

  it('keeps the key order of the Python tool', () => {
    expect(Object.keys(cleanLayoutSettings({}))).toEqual([
      'enabled',
      'x',
      'y',
      'width',
      'height',
      'rows',
      'columns',
      'gap',
      'aspect',
      'live_only',
      'ontop',
      'detector',
      'show_mpv',
    ]);
  });

  it('clamps numbers to their range', () => {
    const cleaned = cleanLayoutSettings({
      x: -99999,
      y: 99999,
      width: 99999,
      height: 500,
      rows: 50,
      columns: -3,
      gap: 1000,
    });

    expect(cleaned).toMatchObject({
      x: -20000,
      y: 20000,
      width: 20000,
      height: 500,
      rows: 12,
      columns: 0,
      gap: 100,
    });
  });

  it('truncates like int(float(value)) and reads numeric strings and booleans', () => {
    expect(cleanLayoutSettings({ gap: 7.9, rows: '3', columns: ' 2.5 ', x: true })).toMatchObject({
      gap: 7,
      rows: 3,
      columns: 2,
      x: 1,
    });
  });

  it.each([['abc'], [''], [null], [[]], [{}], [NaN], [Infinity]])(
    'falls back to the default for the number %p',
    (value) => {
      expect(cleanLayoutSettings({ gap: value }).gap).toBe(DEFAULT_LAYOUT_SETTINGS.gap);
    },
  );

  it('maximizes (width and height 0) when the window is unusably small', () => {
    expect(cleanLayoutSettings({ width: 199, height: 900 })).toMatchObject({ width: 0, height: 0 });
    expect(cleanLayoutSettings({ width: 900, height: 149 })).toMatchObject({ width: 0, height: 0 });
    expect(cleanLayoutSettings({ width: 200, height: 150 })).toMatchObject({
      width: 200,
      height: 150,
    });
  });

  it('resets an unknown aspect or detector and reads flags by Python truthiness', () => {
    const cleaned = cleanLayoutSettings({
      aspect: '4:3',
      detector: 'vlc',
      enabled: 0,
      live_only: 'yes',
      ontop: [],
      show_mpv: null,
    });

    expect(cleaned).toMatchObject({
      aspect: AspectRatio.PORTRAIT,
      detector: Detector.MPV,
      enabled: false,
      live_only: true,
      ontop: false,
      show_mpv: false,
    });
  });
});
