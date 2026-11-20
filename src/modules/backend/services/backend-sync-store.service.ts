import { Injectable } from '@nestjs/common';

import { BackendBrand } from '../models/backend-brand.model';
import { BackendLoginState } from '../models/backend-login-state.model';
import { BackendSchedule } from '../models/backend-schedule.model';
import { BackendSessionInfo } from '../models/backend-session-info.model';
import { onAirSchedules } from '../utils/on-air-schedules';

export interface BackendSyncStatus {
  syncedAt: string | null;
  error: string | null;
  brands: number;
  schedules: number;
}

const EMPTY_STATUS: BackendSyncStatus = { syncedAt: null, error: null, brands: 0, schedules: 0 };

/** The brands, today's schedules and last session answers synced from livestream-backend; memory only, never written to disk. */
@Injectable()
export class BackendSyncStore {
  private brandList: BackendBrand[] = [];
  private schedulesByBrand = new Map<string, BackendSchedule[]>();
  private sessions = new Map<string, BackendSessionInfo>();
  private syncStatus: BackendSyncStatus = EMPTY_STATUS;

  constructor(private readonly session: BackendLoginState) {}

  /** The login the lists belong to: an answer fetched under another epoch is stale. */
  get epoch(): number {
    return this.session.epoch;
  }

  /** Empty without a login, so a login that ended by itself never leaves rows behind. */
  get brands(): readonly BackendBrand[] {
    return this.session.connected ? this.brandList : [];
  }

  /** Without a login only the error is kept: why the login ended. */
  get status(): BackendSyncStatus {
    return this.session.connected
      ? this.syncStatus
      : { ...EMPTY_STATUS, error: this.syncStatus.error };
  }

  schedulesOf(brandId: string): readonly BackendSchedule[] {
    return this.session.connected ? (this.schedulesByBrand.get(brandId) ?? []) : [];
  }

  sessionOf(brandId: string): BackendSessionInfo | null {
    return this.session.connected ? (this.sessions.get(brandId) ?? null) : null;
  }

  onAirSchedules(brandId: string, nowMs = Date.now()): BackendSchedule[] {
    return onAirSchedules(this.schedulesOf(brandId), nowMs);
  }

  /** The on-air schedule whose session was last found live, else the most likely one. */
  onAirSchedule(brandId: string, nowMs = Date.now()): BackendSchedule | null {
    const rows = this.onAirSchedules(brandId, nowMs);
    const liveId = this.sessionOf(brandId)?.scheduleId;
    return rows.find((row) => row.scheduleId === liveId) ?? rows[0] ?? null;
  }

  setBrands(brands: BackendBrand[]): void {
    this.brandList = brands;
    this.refreshCounts();
  }

  setBoard(schedules: Map<string, BackendSchedule[]>): void {
    this.schedulesByBrand = schedules;
    this.refreshCounts();
  }

  setSession(brandId: string, info: BackendSessionInfo): void {
    this.sessions.set(brandId, info);
  }

  markSynced(at: string): void {
    this.syncStatus = { ...this.syncStatus, syncedAt: at, error: null };
  }

  /** The last good lists stay; only the reason is reported. */
  setError(error: string): void {
    this.syncStatus = { ...this.syncStatus, error };
  }

  clear(): void {
    this.brandList = [];
    this.schedulesByBrand = new Map();
    this.sessions = new Map();
    this.syncStatus = EMPTY_STATUS;
  }

  private refreshCounts(): void {
    let schedules = 0;
    for (const rows of this.schedulesByBrand.values()) schedules += rows.length;
    this.syncStatus = { ...this.syncStatus, brands: this.brandList.length, schedules };
  }
}
