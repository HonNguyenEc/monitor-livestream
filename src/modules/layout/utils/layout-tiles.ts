import { LiveStatus } from '../../../common/enums/live-status.enum';
import { DetectionStateStore, isJobRunning } from '../../detection-state';
import { Channel } from '../../shops';
import { LayoutTileDto } from '../dtos/layout-tile.dto';

/**
 * The wall tiles: only channels whose job runs, live ones first, then the others in the order their
 * jobs started (the store keeps that order); with `liveOnly`, only live ones.
 */
export function layoutTiles(
  channels: readonly Channel[],
  store: DetectionStateStore,
  liveOnly: boolean,
): LayoutTileDto[] {
  const byKey = new Map<string, Channel>();
  for (const channel of channels) if (!byKey.has(channel.key)) byKey.set(channel.key, channel);
  const tiles: LayoutTileDto[] = [];
  for (const key of store.keys()) {
    const channel = byKey.get(key);
    const snapshot = store.get(key);
    if (!channel || !isJobRunning(snapshot)) continue;
    tiles.push({
      key,
      label: channel.label,
      live: snapshot.status === LiveStatus.LIVE,
      visible: true,
    });
  }
  const ordered = [...tiles.filter((tile) => tile.live), ...tiles.filter((tile) => !tile.live)];
  return liveOnly ? ordered.filter((tile) => tile.live) : ordered;
}
