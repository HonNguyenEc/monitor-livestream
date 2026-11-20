import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { AsyncLock } from '../../../common/concurrency/async-lock';
import { fsErrorSummary } from '../../../common/fs/fs-error';
import { DEFAULT_LAYOUT_SETTINGS, LAYOUT_FILE } from '../constants/layout-settings.constants';
import { LayoutSettings } from '../models/layout-settings.model';
import { LayoutSettingsChange } from '../models/layout-settings-change.model';
import { LayoutSettingsRepository } from '../repositories/layout-settings.repository';
import { cleanLayoutSettings } from '../utils/clean-layout-settings';

/** The layout settings of mpv_layout.json, shared with the Python tool. */
@Injectable()
export class LayoutSettingsStore {
  private readonly logger = new Logger(LayoutSettingsStore.name);
  private readonly writeLock = new AsyncLock();

  constructor(private readonly repository: LayoutSettingsRepository) {}

  /** Defaults for a missing or unreadable file, as the Python tool; the file is never written from this. */
  async get(): Promise<LayoutSettings> {
    try {
      return cleanLayoutSettings({ ...DEFAULT_LAYOUT_SETTINGS, ...(await this.repository.load()) });
    } catch (error) {
      this.logger.warn(`Cannot read ${LAYOUT_FILE}, using defaults: ${fsErrorSummary(error)}`);
      return { ...DEFAULT_LAYOUT_SETTINGS };
    }
  }

  /** Merges `changes` into the stored settings and saves them; an unreadable file is never overwritten. */
  update(changes: Partial<LayoutSettings>): Promise<LayoutSettingsChange> {
    return this.writeLock.run(async () => {
      let stored: Record<string, unknown>;
      try {
        stored = await this.repository.load();
      } catch (error) {
        this.logger.warn(`Cannot read ${LAYOUT_FILE}: ${fsErrorSummary(error)}`);
        throw new DomainException(
          ErrorCode.LAYOUT_FILE_UNREADABLE,
          ErrorMessage.dataFileUnreadable(LAYOUT_FILE),
        );
      }
      const current = cleanLayoutSettings({ ...DEFAULT_LAYOUT_SETTINGS, ...stored });
      const next = cleanLayoutSettings({ ...current, ...changes });
      await this.repository.save(next);
      return { previous: current, next };
    });
  }
}
