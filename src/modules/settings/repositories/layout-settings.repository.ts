import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';

import { readJsonObject, writeJsonFileAtomic } from '../../../common/fs/json-file';
import { DATA_DIR } from '../../../config/data-dir.module';
import { LAYOUT_FILE, LAYOUT_FILE_INDENT } from '../constants/layout-settings.constants';

/** mpv_layout.json, re-read on every call so edits by hand or by the Python tool apply without a restart. */
@Injectable()
export class LayoutSettingsRepository {
  private readonly path: string;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.path = join(dataDir, LAYOUT_FILE);
  }

  /** The stored object, `{}` for a missing file; throws when the file is present but not a JSON object. */
  async load(): Promise<Record<string, unknown>> {
    return (await readJsonObject(this.path)) ?? {};
  }

  save(settings: object): Promise<void> {
    // Python's json.dumps leaves no newline at the end.
    return writeJsonFileAtomic(this.path, settings, LAYOUT_FILE_INDENT, false);
  }
}
