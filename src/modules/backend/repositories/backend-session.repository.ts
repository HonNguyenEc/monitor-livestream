import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AsyncLock } from '../../../common/concurrency/async-lock';
import { fsErrorSummary } from '../../../common/fs/fs-error';
import { readJsonFile, writeJsonFileAtomic } from '../../../common/fs/json-file';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { DATA_DIR } from '../../../config/data-dir.module';
import { SESSION_FILE, SESSION_FILE_INDENT } from '../constants/backend.constants';
import { BackendSession } from '../models/backend-session.model';
import { isFilledString, readTokens, toUser } from '../utils/backend-values';

@Injectable()
export class BackendSessionRepository {
  private readonly logger = new Logger(BackendSessionRepository.name);
  private readonly path: string;
  // Writes run in call order, so a slower save cannot recreate a file a later clear deleted.
  private readonly lock = new AsyncLock();

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.path = join(dataDir, SESSION_FILE);
  }

  // An unreadable or incomplete file only costs a new login, as in the Python tool.
  async load(): Promise<BackendSession | null> {
    let parsed: unknown;
    try {
      parsed = await readJsonFile(this.path);
    } catch (error) {
      this.logger.warn(`Cannot read ${SESSION_FILE}: ${fsErrorSummary(error)}`);
      return null;
    }
    if (!isPlainObject(parsed) || !isFilledString(parsed.base_url)) {
      return null;
    }
    const tokens = readTokens(parsed);
    return tokens && { base_url: parsed.base_url, ...tokens, user: toUser(parsed.user) };
  }

  /** Saves `session`, or deletes the file for null. */
  store(session: BackendSession | null): Promise<void> {
    return this.lock.run(() =>
      session
        ? writeJsonFileAtomic(this.path, session, SESSION_FILE_INDENT)
        : rm(this.path, { force: true }),
    );
  }

  /** Like store, but a failure is only logged: the session still works from memory until a restart. */
  async storeQuietly(session: BackendSession | null): Promise<void> {
    await this.store(session).catch((error: unknown) =>
      this.logger.warn(`Cannot update ${SESSION_FILE}: ${fsErrorSummary(error)}`),
    );
  }
}
