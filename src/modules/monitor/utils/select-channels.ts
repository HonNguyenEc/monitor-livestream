import { Channel } from '../../shops';
import { MonitorSelection } from '../models/monitor-selection.model';

/** The channels the selection wants, by key; the first of two channels with one key wins, as it does everywhere else. */
export function selectChannels(
  channels: readonly Channel[],
  selection: MonitorSelection,
): Map<string, Channel> {
  const wanted = new Map<string, Channel>();
  for (const channel of channels) {
    const chosen =
      selection.platforms.includes(channel.platform) &&
      (selection.keys === null || selection.keys.has(channel.key));
    if (chosen && !wanted.has(channel.key)) wanted.set(channel.key, channel);
  }
  return wanted;
}
