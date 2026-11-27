import { join } from 'node:path';

import {
  CHILD_PIDS_FILE,
  FRAME_FILE,
  FRAMES_FOLDER,
  MPV_CONFIG_FOLDER,
  RUNTIME_FOLDER,
} from '../common/constants/app.constants';

// Frames, mpv configs and the child pid list live in this subfolder, apart from the Python tool's files.
// Named pipes are not files: they are told apart by their `live-qc-` prefix.
export const runtimeDir = (dataDir: string): string => join(dataDir, RUNTIME_FOLDER);
export const framePathOf = (dataDir: string, key: string): string =>
  join(runtimeDir(dataDir), FRAMES_FOLDER, key, FRAME_FILE);
export const mpvConfigDirOf = (dataDir: string, key: string): string =>
  join(runtimeDir(dataDir), MPV_CONFIG_FOLDER, key);
export const childPidsPathOf = (dataDir: string): string =>
  join(runtimeDir(dataDir), CHILD_PIDS_FILE);
