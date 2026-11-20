import { ChildProcess } from 'node:child_process';
import { rename } from 'node:fs/promises';
import { basename } from 'node:path';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { AsyncLock } from '../../../common/concurrency/async-lock';
import { retryDelayMs } from '../../../common/utils/retry-delay';
import { FILE_NOT_FOUND } from '../../../common/constants/file.constants';
import { fsErrorSummary } from '../../../common/fs/fs-error';
import { readJsonFile, writeJsonFileAtomic } from '../../../common/fs/json-file';
import { killProcessTree, spawnHidden } from '../../../common/process/hidden-process';
import { inspectProcesses, RunningProcess } from '../../../common/process/process-image';
import { DATA_DIR } from '../../../config/data-dir.module';
import { childPidsPathOf } from '../../../config/runtime-artifacts';
import {
  CHILD_PIDS_FAILURE_LOG_EVERY,
  CHILD_PIDS_INDENT,
  CHILD_PIDS_MAX_RETRY_MS,
  CHILD_PIDS_RETRY_SCHEDULE_MS,
  SPAWN_TIME_TOLERANCE_MS,
  UNREADABLE_PIDS_SUFFIX,
} from '../constants/processes.constants';
import { TrackedChild } from '../models/tracked-child.model';

/** Owns the long-lived children (players): kills them with the service and sweeps the ones a crashed run left behind. */
@Injectable()
export class ChildProcessRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(ChildProcessRegistry.name);
  private readonly children = new Map<number, TrackedChild>();
  private readonly fileLock = new AsyncLock();
  private readonly pidsPath: string;
  /** Records of an earlier run that are not confirmed gone (not checked, or the kill was not confirmed); kept in the file until a later start settles them. */
  private carried: TrackedChild[] = [];
  /** The list changed since the last good write. */
  private dirty = false;
  private retryTimer: NodeJS.Timeout | null = null;
  /** Failed writes in a row, counted once per retry. */
  private failedWrites = 0;
  /** The file could be neither read nor moved aside, so it may still hold an earlier run's records: no write replaces it. */
  private unreadInPlace = false;
  private destroying = false;

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.pidsPath = childPidsPathOf(dataDir);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroying = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    await this.killAll();
    // A write that failed earlier gets one last try, so children.json is final when the service exits.
    await this.flush();
  }

  /** Settles once every write asked for so far has been tried. */
  whenSaved(): Promise<void> {
    return this.fileLock.run(() => Promise.resolve());
  }

  /** Starts a hidden child and tracks it until it exits; a child that cannot start is returned untracked. */
  launch(file: string, args: string[]): ChildProcess {
    const child = spawnHidden(file, args);
    const { pid } = child;
    if (pid === undefined) return child;
    this.children.set(pid, { pid, image: basename(file).toLowerCase(), launchedAtMs: Date.now() });
    this.persist();
    child.once('exit', () => this.forget(pid));
    return child;
  }

  /** Kills one tracked child and its tree. */
  async kill(pid: number): Promise<void> {
    if (await killProcessTree(pid)) this.forget(pid);
    else this.logger.warn(`Could not kill ${pid}; it stays in the child list for the next start`);
  }

  async killAll(): Promise<void> {
    await Promise.all([...this.children.keys()].map((pid) => this.kill(pid)));
  }

  /**
   * Kills what a crashed run left running. Call it only once this instance owns the port: a second
   * launch must not kill the players of the first. A pid is killed only when its image and its
   * creation time both match the record, and never when the question could not be answered.
   */
  async sweepOrphans(): Promise<void> {
    try {
      await this.sweep();
    } catch (error) {
      // Best effort after the service is listening: it must never take the service down.
      this.logger.warn(`Orphan sweep failed: ${fsErrorSummary(error)}`);
    }
  }

  private async sweep(): Promise<void> {
    const recorded = await this.readRecorded();
    if (recorded === null) return;
    const old = recorded.filter(({ pid }) => !this.children.has(pid));
    const running = await inspectProcesses(old.map(({ pid }) => pid));
    if (running === null) {
      this.logger.warn('Cannot list the processes; the children of an earlier run are left alone');
      this.carried = old;
      return;
    }
    const ours = old.filter((record) => isSameProcess(record, running));
    for (const record of ours) {
      this.logger.warn(`Killing ${record.image} (${record.pid}) left by an earlier run`);
    }
    const killed = await Promise.all(ours.map(({ pid }) => killProcessTree(pid)));
    // A kill that is not confirmed stays on the list for the next start.
    this.carried = ours.filter((_record, index) => !killed[index]);
    this.persist();
    await this.whenSaved();
  }

  private forget(pid: number): void {
    if (this.children.delete(pid)) this.persist();
  }

  /** Asks for the list to be written; calls that arrive together share one write, and a failed write is tried again. */
  private persist(): void {
    this.dirty = true;
    void this.flush();
  }

  private flush(): Promise<void> {
    return this.fileLock.run(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      try {
        if (this.unreadInPlace) await this.moveAside();
        await writeJsonFileAtomic(
          this.pidsPath,
          [...this.carried, ...this.children.values()],
          CHILD_PIDS_INDENT,
        );
        if (this.failedWrites > 0) this.logger.log(`The child list is saved again`);
        this.failedWrites = 0;
      } catch (error) {
        this.dirty = true;
        this.writeFailed(fsErrorSummary(error));
      }
    });
  }

  private writeFailed(why: string): void {
    if (this.destroying) {
      const current = this.carried.length + this.children.size;
      this.logger.warn(
        `Cannot save the child list at shutdown: ${why}; the file keeps its last saved list, not the ${current} current records`,
      );
      return;
    }
    // A spawn or exit that fails while a retry waits must not stretch the backoff.
    if (this.retryTimer) return;
    this.failedWrites += 1;
    if (this.failedWrites === 1 || this.failedWrites % CHILD_PIDS_FAILURE_LOG_EVERY === 0) {
      this.logger.warn(
        `Cannot save the child list (${this.failedWrites} failures in a row): ${why}; retrying`,
      );
    }
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        void this.flush();
      },
      retryDelayMs(this.failedWrites, CHILD_PIDS_RETRY_SCHEDULE_MS, null, CHILD_PIDS_MAX_RETRY_MS),
    );
    this.retryTimer.unref();
  }

  /** The records of the file; null when it cannot be read, in which case it is moved aside, and no write replaces it before it is. */
  private async readRecorded(): Promise<TrackedChild[] | null> {
    try {
      const parsed = await readJsonFile(this.pidsPath);
      if (parsed === undefined) return [];
      if (Array.isArray(parsed)) {
        const records = parsed.filter(isTrackedChild);
        if (records.length < parsed.length) {
          this.logger.warn(
            `Dropped ${parsed.length - records.length} unusable entries of the child list`,
          );
        }
        return records;
      }
      this.logger.warn(`The child list is a ${typeof parsed}, not a list; moving it aside`);
    } catch (error) {
      this.logger.warn(`Cannot read the child list: ${fsErrorSummary(error)}`);
    }
    await this.moveAside().catch((error: unknown) => {
      this.unreadInPlace = true;
      this.logger.warn(
        `Cannot move the child list aside: ${fsErrorSummary(error)}; it is moved before the next write`,
      );
    });
    return null;
  }

  private async moveAside(): Promise<void> {
    try {
      await rename(this.pidsPath, `${this.pidsPath}${UNREADABLE_PIDS_SUFFIX}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== FILE_NOT_FOUND) throw error;
    }
    this.unreadInPlace = false;
  }
}

function isSameProcess(record: TrackedChild, running: RunningProcess[]): boolean {
  const process = running.find(({ pid }) => pid === record.pid);
  return (
    process !== undefined &&
    process.image === record.image &&
    Math.abs(process.createdMs - record.launchedAtMs) <= SPAWN_TIME_TOLERANCE_MS
  );
}

function isTrackedChild(value: unknown): value is TrackedChild {
  const { pid, image, launchedAtMs } = (value ?? {}) as Partial<TrackedChild>;
  return (
    Number.isInteger(pid) &&
    typeof image === 'string' &&
    image !== '' &&
    Number.isFinite(launchedAtMs)
  );
}
