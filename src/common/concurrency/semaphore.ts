export type Release = () => void;

/** Lets at most `limit` holders in at once; the rest wait in call order. */
export class Semaphore {
  private free: number;
  private readonly waiters: Array<(release: Release) => void> = [];

  constructor(limit: number) {
    this.free = limit;
  }

  /** The release function once a slot is free, or null when `signal` aborts first. Release it exactly once. */
  acquire(signal?: AbortSignal): Promise<Release | null> {
    if (signal?.aborted) return Promise.resolve(null);
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve) => {
      const grant = (release: Release): void => {
        signal?.removeEventListener('abort', giveUp);
        resolve(release);
      };
      const giveUp = (): void => {
        this.waiters.splice(this.waiters.indexOf(grant), 1);
        resolve(null);
      };
      this.waiters.push(grant);
      signal?.addEventListener('abort', giveUp, { once: true });
    });
  }

  private releaser(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next(this.releaser());
      else this.free += 1;
    };
  }
}
