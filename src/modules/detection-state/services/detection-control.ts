import { Injectable, Logger } from '@nestjs/common';

import { errorMessage } from '../../../common/utils/error-message';
import { safeError } from '../../../common/utils/safe-error';

export type StopHandler = (key: string) => Promise<unknown>;

/**
 * The way a module that changes channels (Shops) stops a job without depending on Detection: Detection
 * registers its stop here, and anyone may call it. Stopping a key with no job, or before Detection
 * registered, does nothing.
 */
@Injectable()
export class DetectionControl {
  private readonly logger = new Logger(DetectionControl.name);
  private handler: StopHandler | null = null;

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
      this.logger.warn(`Cannot stop the job of ${key}: ${safeError(errorMessage(error))}`);
    }
  }
}
