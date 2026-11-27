import { win32 } from 'node:path';

import {
  MPV_CONFIG_DIR_ARG,
  MPV_EXE,
  MPV_NO_TERMINAL_ARG,
  MPVNET_EXE,
  MPVNET_MULTI_INSTANCE_ARG,
} from '../constants/players.constants';

/** `mpv_instance_args` of livestream_qc/players.py: arguments that give each channel its own mpv window. */
export function mpvInstanceArgs(player: string, configDir: string): string[] {
  const args = [`${MPV_CONFIG_DIR_ARG}${configDir}`];
  const exe = win32.basename(player).toLowerCase();
  if (exe === MPVNET_EXE) {
    // mpv.net defaults to one process and forwards a new URL to its existing window.
    args.push(MPVNET_MULTI_INSTANCE_ARG);
  } else if (exe === MPV_EXE) {
    args.push(MPV_NO_TERMINAL_ARG);
  }
  return args;
}
