import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DetectionStateStore } from '../../detection-state';
import { Channel } from '../../shops';
import { layoutTiles } from './layout-tiles';

const channel = (key: string): Channel => ({
  key,
  platform: Platform.TIKTOK,
  source: ShopSource.LOCAL,
  label: `label ${key}`,
});
const channels = ['a', 'b', 'c', 'd'].map(channel);

describe('layoutTiles', () => {
  let store: DetectionStateStore;
  beforeEach(() => {
    store = new DetectionStateStore();
  });

  const job = (key: string, status: LiveStatus, jobState = JobState.PLAYING): void => {
    store.update(key, { status, jobState });
  };

  it('has no tile for a channel without a running job', () => {
    job('a', LiveStatus.NOT_CHECKED, JobState.ERROR);
    job('b', LiveStatus.CHECKING, JobState.STOPPING);

    expect(layoutTiles(channels, store, false)).toEqual([]);
  });

  it('lists live tiles first, then the others in the order their jobs started', () => {
    job('c', LiveStatus.OFFLINE, JobState.RETRYING);
    job('a', LiveStatus.LIVE);
    job('d', LiveStatus.CHECKING, JobState.CHECKING_IMAGE);
    job('b', LiveStatus.LIVE);

    expect(layoutTiles(channels, store, false).map((tile) => [tile.key, tile.live])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
      ['d', false],
    ]);
  });

  it('keeps only live tiles with live_only', () => {
    job('a', LiveStatus.OFFLINE, JobState.RETRYING);
    job('b', LiveStatus.LIVE);

    expect(layoutTiles(channels, store, true).map((tile) => tile.key)).toEqual(['b']);
  });

  it('skips a job whose channel no longer exists, and labels the rest', () => {
    job('gone', LiveStatus.LIVE);
    job('a', LiveStatus.LIVE);

    expect(layoutTiles(channels, store, false)).toEqual([
      { key: 'a', label: 'label a', live: true, visible: true },
    ]);
  });
});
