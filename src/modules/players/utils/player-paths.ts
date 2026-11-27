import { win32 } from 'node:path';

import { BUNDLED_MPV_FOLDER, MPV_EXE } from '../constants/players.constants';

export const isMpvExe = (path: string): boolean => win32.basename(path).toLowerCase() === MPV_EXE;

/** The mpv an installed service ships beside its executable. */
export const bundledMpvPath = (execPath: string = process.execPath): string =>
  win32.join(win32.dirname(execPath), BUNDLED_MPV_FOLDER, MPV_EXE);

export const isSamePath = (a: string, b: string): boolean =>
  win32.normalize(a).toLowerCase() === win32.normalize(b).toLowerCase();
