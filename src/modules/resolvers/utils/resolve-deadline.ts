import { DEFAULT_RESOLVE_TIMEOUT_MS, MIN_HOP_TIMEOUT_MS } from '../constants/resolver.constants';
import { ResolveRequest } from '../models/resolve-request.model';

/** One budget for a whole resolve: every hop gets what is left of it, and the caller can cancel all of them. */
export class ResolveDeadline {
  private readonly endsAtMs: number;

  constructor(
    totalMs: number,
    readonly signal?: AbortSignal,
    nowMs = Date.now(),
  ) {
    this.endsAtMs = nowMs + totalMs;
  }

  static of(request: ResolveRequest, nowMs = Date.now()): ResolveDeadline {
    return new ResolveDeadline(
      request.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS,
      request.signal,
      nowMs,
    );
  }

  expired(nowMs = Date.now()): boolean {
    return nowMs >= this.endsAtMs;
  }

  /** Never below MIN_HOP_TIMEOUT_MS, so a spent budget makes the next hop time out at once instead of throwing on a zero timeout. */
  remainingMs(nowMs = Date.now()): number {
    return Math.max(MIN_HOP_TIMEOUT_MS, this.endsAtMs - nowMs);
  }
}
