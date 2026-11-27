import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { Channel } from '../../shops';
import { diffMonitor } from './diff-monitor';
import { toMonitorState, toSelection } from './monitor-state';
import { selectChannels } from './select-channels';

const channel = (key: string, platform: Platform): Channel => ({
  key,
  platform,
  source: ShopSource.LOCAL,
  label: key,
});
const channels = [
  channel('tiktok_a', Platform.TIKTOK),
  channel('tiktok_b', Platform.TIKTOK),
  channel('shopee_a', Platform.SHOPEE),
];

describe('selectChannels', () => {
  it('takes every channel of the platforms when keys is null', () => {
    const selected = selectChannels(channels, { platforms: [Platform.TIKTOK], keys: null });

    expect([...selected.keys()]).toEqual(['tiktok_a', 'tiktok_b']);
  });

  it('takes only the listed keys of the platforms; a key of another platform is not taken', () => {
    const selected = selectChannels(channels, {
      platforms: [Platform.TIKTOK],
      keys: new Set(['tiktok_b', 'shopee_a', 'nope']),
    });

    expect([...selected.keys()]).toEqual(['tiktok_b']);
  });

  it('keys: [] monitors none', () => {
    expect(
      selectChannels(channels, { platforms: [Platform.TIKTOK, Platform.SHOPEE], keys: new Set() })
        .size,
    ).toBe(0);
  });

  it('keeps the first of two channels that share a key', () => {
    const twin = { ...channels[0], label: 'second' };

    expect(
      selectChannels([...channels, twin], { platforms: [Platform.TIKTOK], keys: null }).get(
        'tiktok_a',
      )?.label,
    ).toBe('tiktok_a');
  });
});

describe('diffMonitor', () => {
  it('starts what is wanted and not started, in the order wanted', () => {
    expect(diffMonitor(['b', 'a', 'c'], new Set(['a']))).toEqual({ stop: [], start: ['b', 'c'] });
  });

  it('stops what was started and is no longer wanted', () => {
    expect(diffMonitor(['a'], new Set(['a', 'x', 'y']))).toEqual({ stop: ['x', 'y'], start: [] });
  });

  it('does nothing when the two agree, however long a job has run or ended', () => {
    expect(diffMonitor(['a', 'b'], new Set(['b', 'a']))).toEqual({ stop: [], start: [] });
  });

  it('a channel that left and came back is started again', () => {
    const started = new Set(['a']);
    expect(diffMonitor([], started).stop).toEqual(['a']);

    expect(diffMonitor(['a'], new Set()).start).toEqual(['a']);
  });
});

describe('monitor state', () => {
  it('is stopped without a selection', () => {
    expect(toMonitorState(null)).toEqual({ running: false, platforms: [], keys: null });
  });

  it('lists the platforms once and the keys sorted', () => {
    const state = toMonitorState(
      toSelection({
        platforms: [Platform.SHOPEE, Platform.TIKTOK, Platform.SHOPEE],
        keys: ['b', 'a', 'b'],
      }),
    );

    expect(state).toEqual({ running: true, platforms: ['shopee', 'tiktok'], keys: ['a', 'b'] });
  });

  it('treats missing and null keys as every shop, and an empty list as none', () => {
    expect(toSelection({ platforms: [Platform.TIKTOK] }).keys).toBeNull();
    expect(toSelection({ platforms: [Platform.TIKTOK], keys: null }).keys).toBeNull();
    expect(toSelection({ platforms: [Platform.TIKTOK], keys: [] }).keys).toEqual(new Set());
  });
});
