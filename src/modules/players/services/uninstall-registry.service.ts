import { Injectable } from '@nestjs/common';

import { execFileHidden } from '../../../common/process/hidden-process';
import {
  DISPLAY_NAME_VALUE,
  INSTALL_LOCATION_VALUE,
  REG_EXE,
  REG_QUERY_MAX_BUFFER_BYTES,
  REG_QUERY_TIMEOUT_MS,
  REGISTRY_HIVES,
  REGISTRY_ROOT_PREFIX,
  UNINSTALL_KEY,
} from '../constants/players.constants';

// `reg query /s` prints "    <name>    <REG_TYPE>    <data>"; names may contain single spaces.
const REG_VALUE_LINE = /^ {4}(.+?) {4}REG_[A-Z_]+(?: {4}(.*))?$/;

export interface UninstallEntry {
  displayName: string;
  installLocation: string;
}

/** Parses `reg query <Uninstall key> /s`, keeping only direct sub-keys that name an install location. */
export function parseUninstallEntries(output: string): UninstallEntry[] {
  const entries: UninstallEntry[] = [];
  let values: Map<string, string> | null = null;
  const flush = (): void => {
    const displayName = values?.get(DISPLAY_NAME_VALUE);
    const installLocation = values?.get(INSTALL_LOCATION_VALUE);
    if (displayName && installLocation) {
      entries.push({ displayName, installLocation });
    }
  };
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith(REGISTRY_ROOT_PREFIX)) {
      flush();
      values = isDirectSubKey(line) ? new Map() : null;
      continue;
    }
    if (!values) {
      continue;
    }
    const match = REG_VALUE_LINE.exec(line);
    if (match) {
      values.set(match[1], (match[2] ?? '').trim());
    }
  }
  flush();
  return entries;
}

function isDirectSubKey(header: string): boolean {
  const index = header.toLowerCase().indexOf(`${UNINSTALL_KEY.toLowerCase()}\\`);
  return index >= 0 && !header.slice(index + UNINSTALL_KEY.length + 1).includes('\\');
}

/** The "Apps & features" entries, read with reg.exe because Node has no registry API. */
@Injectable()
export class UninstallRegistry {
  async entries(): Promise<UninstallEntry[]> {
    const perHive = await Promise.all(REGISTRY_HIVES.map((hive) => this.query(hive)));
    return perHive.flat();
  }

  private async query(hive: string): Promise<UninstallEntry[]> {
    try {
      const { stdout } = await execFileHidden(
        REG_EXE,
        ['query', `${hive}\\${UNINSTALL_KEY}`, '/s'],
        {
          timeout: REG_QUERY_TIMEOUT_MS,
          maxBuffer: REG_QUERY_MAX_BUFFER_BYTES,
        },
      );
      return parseUninstallEntries(stdout);
    } catch {
      // A missing key, or a machine without reg.exe, just means no registered installs.
      return [];
    }
  }
}
