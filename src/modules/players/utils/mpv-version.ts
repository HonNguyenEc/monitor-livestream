import { MPV_MEDIA_CONTROLS_MIN_MINOR, MPV_VERSION_PATTERN } from '../constants/players.constants';

/** Whether the `mpv --version` text names a build that knows `--media-controls`; unreadable text says no. */
export function knowsMediaControls(versionText: string): boolean {
  const match = MPV_VERSION_PATTERN.exec(versionText);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 0 || minor >= MPV_MEDIA_CONTROLS_MIN_MINOR;
}
