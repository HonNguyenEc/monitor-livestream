import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';

import { readJsonFile, writeJsonFileAtomic } from '../../../common/fs/json-file';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { DATA_DIR } from '../../../config/data-dir.module';
import { SHOPS_FILE, SHOPS_FILE_INDENT } from '../constants/shops.constants';
import { ShopsDocument } from '../models/shop-record.model';

/** shops.json, re-read on every call so edits by hand or by the Python tool apply without a restart. */
@Injectable()
export class ShopRepository {
  private readonly path: string;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.path = join(dataDir, SHOPS_FILE);
  }

  // A missing file is an installed copy's first run; an unreadable one must fail rather than be overwritten.
  async load(): Promise<ShopsDocument> {
    const parsed = await readJsonFile(this.path);
    if (parsed === undefined) {
      return { shops: [] };
    }
    if (!isPlainObject(parsed)) {
      throw new Error(`${this.path} is not a JSON object`);
    }
    return { ...parsed, shops: Array.isArray(parsed.shops) ? parsed.shops : [] };
  }

  save(document: ShopsDocument): Promise<void> {
    return writeJsonFileAtomic(this.path, document, SHOPS_FILE_INDENT);
  }
}
