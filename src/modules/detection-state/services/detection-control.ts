import { Injectable, Logger } from '@nestjs/common';

import { safeErrorMessage } from '../../../common/utils/safe-error-message';

export type StopHandler = (key: string) => Promise<unknown>;
export type RenameListener = (oldKey: string, newKey: string) => void;

/**
 * The way a module that changes channels (Shops) stops a job without depending on Detection: Detection
 * registers its stop here, and anyone may call it. Stopping a key with no job, or before Detection
 * registered, does nothing.
 */
@Injectable()
export class DetectionControl {
  private readonly logger = new Logger(DetectionControl.name);
  private handler: StopHandler | null = null;
  private readonly renameListeners: RenameListener[] = [];

  /** Called once by the module that owns the jobs; a second registration is a wiring mistake. */
  register(handler: StopHandler): void {
    if (this.handler) throw new Error('A stop handler is already registered');
    this.handler = handler;
  }

  /** Never throws: the change that asked for it (a delete, a rename) is already saved. */
  async stop(key: string): Promise<void> {
    try {
      await this.handler?.(key);
    } catch (error) {
      this.logger.warn(`Cannot stop the job of ${key}: ${safeErrorMessage(error)}`);
    }
  }

  /** Whoever tracks channels by key (the monitor) follows a rename with this. */
  onRename(listener: RenameListener): void {
    this.renameListeners.push(listener);
  }

  /** A channel changed key: the job of the old key ends, then every listener learns the new key. Never throws, like stop. */
  async rename(oldKey: string, newKey: string): Promise<void> {
    await this.stop(oldKey);
    for (const listener of this.renameListeners) {
      try {
        listener(oldKey, newKey);
      } catch (error) {
        this.logger.warn(`Cannot follow the rename of ${oldKey}: ${safeErrorMessage(error)}`);
      }
    }
  }
}
