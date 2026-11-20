import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { fsErrorSummary } from '../../../common/fs/fs-error';
import { readJsonObject, writeJsonFileAtomic } from '../../../common/fs/json-file';
import { NotJsonObjectError } from '../../../common/fs/not-json-object.error';
import { DATA_DIR } from '../../../config/data-dir.module';
import { SHOPS_FILE, SHOPS_FILE_INDENT } from '../constants/shops.constants';
import { ShopsDocument } from '../models/shop-record.model';

/** shops.json, re-read on every call so edits by hand or by the Python tool apply without a restart. */
@Injectable()
export class ShopRepository {
  private readonly logger = new Logger(ShopRepository.name);
  private readonly path: string;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.path = join(dataDir, SHOPS_FILE);
  }

  // A missing file is an installed copy's first run. Anything present but unusable (bad JSON, a non-object
  // root, a `shops` value that is not a list) must fail rather than be overwritten by the next save.
  async load(): Promise<ShopsDocument> {
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = await readJsonObject(this.path);
    } catch (error) {
      if (!(error instanceof NotJsonObjectError)) {
        this.logger.warn(`Cannot read ${SHOPS_FILE}: ${fsErrorSummary(error)}`);
      }
      throw unreadable();
    }
    if (parsed === undefined) {
      return { shops: [] };
    }
    if (parsed.shops !== undefined && !Array.isArray(parsed.shops)) {
      throw unreadable();
    }
    return { ...parsed, shops: parsed.shops ?? [] };
  }

  save(document: ShopsDocument): Promise<void> {
    return writeJsonFileAtomic(this.path, document, SHOPS_FILE_INDENT);
  }
}

function unreadable(): DomainException {
  return new DomainException(
    ErrorCode.SHOPS_FILE_UNREADABLE,
    ErrorMessage.dataFileUnreadable(SHOPS_FILE),
  );
}
