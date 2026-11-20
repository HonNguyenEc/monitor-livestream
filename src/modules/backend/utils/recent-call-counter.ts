import { performance } from 'node:perf_hooks';

/** Counts events over a sliding window of `windowMs`, on a monotonic clock. */
export class RecentCallCounter {
  private readonly times: number[] = [];

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  record(): void {
    this.times.push(this.now());
    this.prune();
  }

  count(): number {
    this.prune();
    return this.times.length;
  }

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.times.length > 0 && this.times[0] < cutoff) {
      this.times.shift();
    }
  }
}
