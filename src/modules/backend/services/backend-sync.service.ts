import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { MAX_RETRY_DELAY_MS, MS_PER_SECOND } from '../../../common/constants/time.constants';
import { retryDelayMs } from '../../../common/utils/retry-delay';
import { BackendApiClient } from '../clients/backend-api.client';
import {
  BOARD_REFRESH_MS,
  BRANDS_REFRESH_MS,
  SYNC_BACKOFF_SCHEDULE_MS,
  SYNC_TICK_MS,
} from '../constants/backend-sync.constants';
import { BackendAuthError } from '../errors/backend-auth.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { BackendBrand } from '../models/backend-brand.model';
import { BackendSchedule } from '../models/backend-schedule.model';
import { backendErrorDetail, backendErrorText } from '../utils/backend-error-text';
import { localDate } from '../utils/local-date';
import { BackendLoginState } from '../models/backend-login-state.model';
import { BackendSyncStore } from './backend-sync-store.service';

interface RunningSync {
  /** Login epoch it started under: a new login or a logout makes it stale. */
  epoch: number;
  /** Reads both brands and board, so it answers a forced sync too. */
  full: boolean;
  done: Promise<void>;
}

interface SyncPlan {
  needBrands: boolean;
  needBoard: boolean;
}

/**
 * Keeps the brands and today's schedules in BackendSyncStore, as BackendSync of backend_sync.py: a
 * 30 s tick refreshes whatever is due, and a failure backs off while the last good lists stay. A
 * lost login (a refused refresh token) resets everything synced. One sync runs at a time per login:
 * a forced sync joins a running full one instead of reading again.
 */
@Injectable()
export class BackendSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackendSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: RunningSync | null = null;
  private brandsAt = 0;
  private boardAt = 0;
  private boardDay = '';
  private failures = 0;
  private retryAt = 0;

  constructor(
    private readonly session: BackendLoginState,
    private readonly api: BackendApiClient,
    private readonly store: BackendSyncStore,
  ) {}

  // Not onModuleInit: that hook runs while the stored login may still be loading.
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.safeTick(), SYNC_TICK_MS);
    this.timer.unref();
    void this.safeTick();
  }

  // A throw nobody awaits would end the service, and with it every monitored channel.
  private async safeTick(): Promise<void> {
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`Sync tick failed: ${backendErrorDetail(error)}`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Reads brands and board now (login, the sync button), ignoring the intervals and any backoff. A
   * full sync already running for this login answers it; a partial tick is waited for first.
   */
  async syncNow(): Promise<void> {
    for (let running = this.runningNow(); running && !running.full; running = this.runningNow()) {
      await running.done;
    }
    await (this.runningNow()?.done ?? this.start(true));
  }

  /** Drops everything synced: a logout, or a login to another backend or account. */
  reset(): void {
    this.store.clear();
    this.brandsAt = 0;
    this.boardAt = 0;
    this.boardDay = '';
    this.failures = 0;
    this.retryAt = 0;
  }

  async tick(): Promise<void> {
    if (!this.session.connected || Date.now() < this.retryAt || this.runningNow()) return;
    await this.start(false);
  }

  /** The running sync of the current login; one that started before a reset is stale and ignored. */
  private runningNow(): RunningSync | null {
    return this.running?.epoch === this.store.epoch ? this.running : null;
  }

  private start(force: boolean): Promise<void> {
    const now = Date.now();
    const plan: SyncPlan = {
      needBrands: force || !this.brandsAt || now - this.brandsAt >= BRANDS_REFRESH_MS,
      needBoard:
        force ||
        !this.boardAt ||
        now - this.boardAt >= BOARD_REFRESH_MS ||
        this.boardDay !== localDate(now),
    };
    if (!plan.needBrands && !plan.needBoard) return Promise.resolve();
    const epoch = this.store.epoch;
    const running: RunningSync = {
      epoch,
      full: plan.needBrands && plan.needBoard,
      done: this.sync(plan, epoch, now).finally(() => {
        if (this.running === running) this.running = null;
      }),
    };
    this.running = running;
    return running.done;
  }

  private async sync(
    { needBrands, needBoard }: SyncPlan,
    epoch: number,
    now: number,
  ): Promise<void> {
    const today = localDate(now);
    let brands: BackendBrand[] | null = null;
    let board: Map<string, BackendSchedule[]> | null = null;
    try {
      brands = needBrands ? await this.api.brands() : null;
      board = needBoard ? await this.api.board(today) : null;
    } catch (error) {
      if (this.isCurrent(epoch, error)) this.fail(error);
      return;
    }
    if (epoch !== this.store.epoch) return;
    this.failures = 0;
    this.retryAt = 0;
    if (brands) {
      this.store.setBrands(brands);
      this.brandsAt = now;
    }
    if (board) {
      this.store.setBoard(board);
      this.boardAt = now;
      this.boardDay = today;
    }
    this.store.markSynced(new Date().toISOString());
    const { brands: brandCount, schedules } = this.store.status;
    this.logger.log(`Synced: ${brandCount} Shopee API brands, ${schedules} schedules today`);
  }

  /** A failure of an older login is dropped, except the one that ended the login itself. */
  private isCurrent(epoch: number, error: unknown): boolean {
    const endedHere = error instanceof BackendAuthError && error.endedEpoch === this.store.epoch;
    return epoch === this.store.epoch || endedHere;
  }

  private fail(error: unknown): void {
    const reason = backendErrorText(error);
    if (error instanceof BackendAuthError) {
      this.reset();
      this.store.setError(reason);
      this.logger.warn(`Sync stopped: ${reason} [${backendErrorDetail(error)}]`);
      return;
    }
    this.failures += 1;
    const retryAfter = error instanceof BackendRequestError ? error.retryAfterSeconds : null;
    const delayMs = retryDelayMs(
      this.failures,
      SYNC_BACKOFF_SCHEDULE_MS,
      retryAfter,
      MAX_RETRY_DELAY_MS,
    );
    this.retryAt = Date.now() + delayMs;
    this.store.setError(reason);
    this.logger.warn(
      `Sync failed: ${reason} [${backendErrorDetail(error)}]; retrying in ${delayMs / MS_PER_SECOND}s`,
    );
  }
}
