import { MonitorStateDto } from '../dtos/monitor-state.dto';
import { StartMonitorDto } from '../dtos/start-monitor.dto';
import { MonitorSelection } from '../models/monitor-selection.model';

export const STOPPED_MONITOR: Readonly<MonitorStateDto> = Object.freeze({
  running: false,
  platforms: [],
  keys: null,
});

export function toSelection(body: StartMonitorDto): MonitorSelection {
  return {
    platforms: [...new Set(body.platforms)],
    keys: body.keys ? new Set(body.keys) : null,
  };
}

/** Keys come sorted, as monitor.py lists them. */
export function toMonitorState(selection: MonitorSelection | null): MonitorStateDto {
  if (!selection) return { ...STOPPED_MONITOR, platforms: [] };
  return {
    running: true,
    platforms: [...selection.platforms],
    keys: selection.keys ? [...selection.keys].sort() : null,
  };
}
