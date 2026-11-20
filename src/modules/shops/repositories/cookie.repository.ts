import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { readJsonFile, writeJsonFileAtomic } from '../../../common/fs/json-file';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { DATA_DIR } from '../../../config/data-dir.module';
import { COOKIES_FILE, COOKIES_FILE_INDENT } from '../constants/shops.constants';
import { CookieStore } from '../models/shop-record.model';

/** shopee_cookies.json: one Seller Center cookie per Shopee user_id. Never log its values. */
@Injectable()
export class CookieRepository {
  private readonly logger = new Logger(CookieRepository.name);
  private readonly path: string;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.path = join(dataDir, COOKIES_FILE);
  }

  // Like the Python tool, an unreadable file counts as empty: the shops then show no stored cookie.
  async load(): Promise<CookieStore> {
    try {
      const parsed = await readJsonFile(this.path);
      return isPlainObject(parsed) ? parsed : {};
    } catch (error) {
      this.logger.warn(`Cannot read ${COOKIES_FILE}: ${(error as Error).name}`);
      return {};
    }
  }

  save(cookies: CookieStore): Promise<void> {
    return writeJsonFileAtomic(this.path, cookies, COOKIES_FILE_INDENT);
  }
}
