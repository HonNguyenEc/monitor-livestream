import { homedir } from 'node:os';
import { join } from 'node:path';
import { isSea } from 'node:sea';

import { APP_DATA_FOLDER, DATA_FOLDER } from '../common/constants/app.constants';

// Relative to this file (src/config or dist/config), so the service can start from any directory.
export const PROJECT_ROOT = join(__dirname, '..', '..');

// An installed copy keeps its data in the user profile, so an upgrade can replace every program file.
export function resolveDataDir(): string {
  if (!isSea()) {
    return PROJECT_ROOT;
  }
  const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  return join(localAppData, APP_DATA_FOLDER, DATA_FOLDER);
}
