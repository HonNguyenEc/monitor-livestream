import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { fsErrorSummary } from '../../../common/fs/fs-error';
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

  // Only a missing file is empty. Callers write the result back, so an unreadable file must fail
  // instead of letting the next save replace every stored cookie.
  async load(): Promise<CookieStore> {
    let parsed: unknown;
    try {
      parsed = await readJsonFile(this.path);
    } catch (error) {
      this.logger.warn(`Cannot read ${COOKIES_FILE}: ${fsErrorSummary(error)}`);
      throw unreadable();
    }
    if (parsed === undefined) {
      return {};
    }
    if (!isPlainObject(parsed)) {
      throw unreadable();
    }
    return parsed;
  }

  save(cookies: CookieStore): Promise<void> {
    return writeJsonFileAtomic(this.path, cookies, COOKIES_FILE_INDENT);
  }
}

function unreadable(): DomainException {
  return new DomainException(
    ErrorCode.COOKIES_FILE_UNREADABLE,
    ErrorMessage.dataFileUnreadable(COOKIES_FILE),
  );
}
