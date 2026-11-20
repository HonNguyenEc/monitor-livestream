import {
  MPV_FORCE_WINDOW_ARG,
  MPV_IPC_SERVER_ARG,
  MPV_KEEP_OPEN_ARG,
  MPV_MUTE_ARG,
  MPV_NO_MEDIA_CONTROLS_ARG,
  MPV_NO_VIDEO_ARGS,
  MPV_TITLE_ARG,
} from '../constants/players.constants';
import { MpvPlayer } from '../models/mpv-player.model';
import { mpvInstanceArgs } from './mpv-instance-args';
import { isMpvExe } from './player-paths';

export interface MpvLaunch {
  player: MpvPlayer;
  configDir: string;
  pipePath: string;
  /** No window at all: the stream is decoded and its frames counted, nothing is shown. */
  hidden: boolean;
  title: string;
  url: string;
}

/**
 * The mpv command line of one channel. Hidden mpv.exe runs with no video or audio output, which
 * keeps `estimated-frame-number` counting (checked on mpv 0.42). mpv.net ignores those options, so
 * hidden it is muted and still opens its window; Python passes it only the mute.
 */
export function mpvLaunchArgs({
  player,
  configDir,
  pipePath,
  hidden,
  title,
  url,
}: MpvLaunch): string[] {
  const isMpv = isMpvExe(player.path);
  const mode = hidden
    ? isMpv
      ? [
          ...MPV_NO_VIDEO_ARGS,
          ...(player.supportsMediaControlsFlag ? [MPV_NO_MEDIA_CONTROLS_ARG] : []),
        ]
      : [MPV_MUTE_ARG, MPV_FORCE_WINDOW_ARG]
    : [MPV_FORCE_WINDOW_ARG];
  return [
    ...mpvInstanceArgs(player.path, configDir),
    ...mode,
    `${MPV_IPC_SERVER_ARG}${pipePath}`,
    MPV_KEEP_OPEN_ARG,
    `${MPV_TITLE_ARG}${title}`,
    url,
  ];
}
