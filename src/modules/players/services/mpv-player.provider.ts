import { isSea } from 'node:sea';
import { Injectable, Logger } from '@nestjs/common';

import { runHidden } from '../../../common/process/hidden-process';
import { PROCESS_SUCCESS_EXIT_CODE } from '../../../common/process/process.constants';
import { safeErrorMessage } from '../../../common/utils/safe-error-message';
import {
  MPV_MISSING_RECHECK_MS,
  MPV_VERSION_ARG,
  MPV_VERSION_TIMEOUT_MS,
} from '../constants/players.constants';
import { MpvPlayer } from '../models/mpv-player.model';
import { knowsMediaControls } from '../utils/mpv-version';
import { bundledMpvPath, isMpvExe, isSamePath } from '../utils/player-paths';
import { PlayerLocator } from './player-locator.service';

/** The player every job launches. Found on first use and remembered, with whether it knows `--media-controls`, so a job never repeats the registry scan or `mpv --version`. */
@Injectable()
export class MpvPlayerProvider {
  private readonly logger = new Logger(MpvPlayerProvider.name);
  private known: MpvPlayer | null = null;
  private missingUntilMs = 0;
  private lookup: Promise<MpvPlayer | null> | null = null;

  constructor(private readonly locator: PlayerLocator) {}

  /** The player, or null when none is installed; a miss is believed for a short while only. */
  get(nowMs = Date.now()): Promise<MpvPlayer | null> {
    if (this.known) return Promise.resolve(this.known);
    if (nowMs < this.missingUntilMs) return Promise.resolve(null);
    this.lookup ??= this.find(nowMs).finally(() => {
      this.lookup = null;
    });
    return this.lookup;
  }

  /** Drops what is known, after a launch failed: the next job looks again. */
  forget(): void {
    this.known = null;
    this.missingUntilMs = 0;
  }

  private async find(nowMs: number): Promise<MpvPlayer | null> {
    let path: string | null = null;
    try {
      path = await this.locator.find();
    } catch (error) {
      this.logger.warn(`Cannot look for mpv: ${safeErrorMessage(error)}`);
    }
    if (!path) {
      this.missingUntilMs = nowMs + MPV_MISSING_RECHECK_MS;
      return null;
    }
    this.known = { path, supportsMediaControlsFlag: await this.knowsMediaControls(path) };
    return this.known;
  }

  private async knowsMediaControls(path: string): Promise<boolean> {
    if (isSea() && isSamePath(path, bundledMpvPath())) return true;
    if (!isMpvExe(path)) return false;
    const run = await runHidden(path, [MPV_VERSION_ARG], { timeoutMs: MPV_VERSION_TIMEOUT_MS });
    if (run.exitCode !== PROCESS_SUCCESS_EXIT_CODE) {
      this.logger.warn(
        `mpv --version gave no answer (exit ${run.exitCode}); --media-controls is left out`,
      );
    }
    return knowsMediaControls(run.stdout);
  }
}
