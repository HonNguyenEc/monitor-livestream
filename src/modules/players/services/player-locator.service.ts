import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { win32 } from 'node:path';
import { isSea } from 'node:sea';
import { Injectable } from '@nestjs/common';

import { isFile } from '../../../common/fs/is-file';
import {
  DEFAULT_PROGRAM_FILES,
  LOCAL_APPDATA_FALLBACK,
  MPV_EXE,
  MPVNET_EXE,
  MPVNET_FALLBACK_DIR,
  PATH_PLAYER_NAMES,
  PROGRAM_FILES_MPV_FOLDERS,
  REGISTRY_MPV_MARKER,
  SCOOP_MPV_DIR,
  WINGET_DIR,
  WINGET_LINKS_FOLDER,
  WINGET_MPV_PACKAGE_PREFIX,
  WINGET_PACKAGES_FOLDER,
} from '../constants/players.constants';
import { bundledMpvPath } from '../utils/player-paths';
import { UninstallRegistry } from './uninstall-registry.service';

/** Finds mpv the way the Python tool does, after a copy bundled beside the installed executable. */
@Injectable()
export class PlayerLocator {
  constructor(private readonly registry: UninstallRegistry) {}

  async find(): Promise<string | null> {
    for await (const candidate of this.search()) {
      if (await isFile(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  // Lazy, so the two reg.exe scans run only when no earlier location has mpv.
  private async *search(): AsyncGenerator<string> {
    const localAppData =
      process.env.LOCALAPPDATA || win32.join(homedir(), ...LOCAL_APPDATA_FALLBACK);
    const programFiles = process.env.ProgramFiles || DEFAULT_PROGRAM_FILES;
    const winget = win32.join(localAppData, ...WINGET_DIR);
    if (isSea()) {
      yield bundledMpvPath();
    }
    yield* onPath();
    yield win32.join(winget, WINGET_LINKS_FOLDER, MPV_EXE);
    yield* await wingetPackages(win32.join(winget, WINGET_PACKAGES_FOLDER));
    yield* PROGRAM_FILES_MPV_FOLDERS.map((folder) => win32.join(programFiles, folder, MPV_EXE));
    yield* await this.registered();
    yield win32.join(homedir(), ...SCOOP_MPV_DIR, MPV_EXE);
    yield win32.join(localAppData, ...MPVNET_FALLBACK_DIR, MPVNET_EXE);
  }

  // Installers such as winget's shinchiro.mpv register in "Apps & features" without touching PATH.
  private async registered(): Promise<string[]> {
    const entries = await this.registry.entries();
    return entries
      .filter((entry) => entry.displayName.toLowerCase().includes(REGISTRY_MPV_MARKER))
      .map((entry) => win32.join(entry.installLocation, MPV_EXE));
  }
}

function onPath(): string[] {
  const dirs = (process.env.PATH ?? '').split(win32.delimiter).filter(Boolean);
  return PATH_PLAYER_NAMES.flatMap((name) => dirs.map((dir) => win32.join(dir, name)));
}

async function wingetPackages(packagesDir: string): Promise<string[]> {
  try {
    const names = await readdir(packagesDir);
    return names
      .filter((name) => name.startsWith(WINGET_MPV_PACKAGE_PREFIX))
      .sort()
      .map((name) => win32.join(packagesDir, name, MPV_EXE));
  } catch {
    return [];
  }
}
