import { ChildProcess } from 'node:child_process';
import { rename } from 'node:fs/promises';
import { basename } from 'node:path';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { AsyncLock } from '../../../common/concurrency/async-lock';
import { fsErrorSummary } from '../../../common/fs/fs-error';
import { readJsonFile, writeJsonFileAtomic } from '../../../common/fs/json-file';
import { killProcessTree, spawnHidden } from '../../../common/process/hidden-process';
import { inspectProcesses, RunningProcess } from '../../../common/process/process-image';
import { DATA_DIR } from '../../../config/data-dir.module';
import { childPidsPathOf } from '../../../config/runtime-artifacts';
import {
  CHILD_PIDS_INDENT,
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

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.pidsPath = childPidsPathOf(dataDir);
  }

  async onModuleDestroy(): Promise<void> {
    await this.killAll();
    // Waits for the queued writes, so children.json is final when the service exits.
    await this.fileLock.run(() => Promise.resolve());
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
    await this.writePids();
  }

  private forget(pid: number): void {
    if (this.children.delete(pid)) this.persist();
  }

  private persist(): void {
    void this.writePids().catch((error: unknown) =>
      this.logger.warn(`Cannot save the child list: ${fsErrorSummary(error)}`),
    );
  }

  private writePids(): Promise<void> {
    return this.fileLock.run(() =>
      writeJsonFileAtomic(
        this.pidsPath,
        [...this.carried, ...this.children.values()],
        CHILD_PIDS_INDENT,
      ),
    );
  }

  /** The records of the file; null when it cannot be read, in which case it is moved aside instead of being overwritten. */
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
    await rename(this.pidsPath, `${this.pidsPath}${UNREADABLE_PIDS_SUFFIX}`).catch(
      (error: unknown) =>
        this.logger.warn(`Cannot move the child list aside: ${fsErrorSummary(error)}`),
    );
    return null;
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
