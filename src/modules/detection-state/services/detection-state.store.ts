import { Injectable } from '@nestjs/common';

import { DetectionSnapshot, IDLE_DETECTION } from '../models/detection-snapshot.model';

/** The detection state of every channel with a job, by channel key; memory only, never written to disk. */
@Injectable()
export class DetectionStateStore {
  private readonly snapshots = new Map<string, DetectionSnapshot>();

  /** The idle snapshot for a key without a job. */
  get(key: string): DetectionSnapshot {
    return this.snapshots.get(key) ?? IDLE_DETECTION;
  }

  has(key: string): boolean {
    return this.snapshots.has(key);
  }

  keys(): string[] {
    return [...this.snapshots.keys()];
  }

  /** Merges `changes` into the snapshot; a key without one starts from idle. */
  update(key: string, changes: Partial<DetectionSnapshot>): DetectionSnapshot {
    const next = { ...this.get(key), ...changes };
    this.snapshots.set(key, next);
    return next;
  }

  delete(key: string): void {
    this.snapshots.delete(key);
  }
}
