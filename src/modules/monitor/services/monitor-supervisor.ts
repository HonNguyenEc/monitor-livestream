import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { abortableSleep } from '../../../common/concurrency/abortable-sleep';
import { errorMessage } from '../../../common/utils/error-message';
import { safeError } from '../../../common/utils/safe-error';
import { DetectionService } from '../../detection';
import { DetectionControl } from '../../detection-state';
import { Channel, ChannelDirectory } from '../../shops';
import {
  MONITOR_PASS_MS,
  MONITOR_START_STAGGER_MS,
  MonitorEvent,
} from '../constants/monitor.constants';
import { MonitorSelection } from '../models/monitor-selection.model';
import { diffMonitor } from '../utils/diff-monitor';
import { selectChannels } from '../utils/select-channels';

/**
 * Keeps one detection job per monitored channel, as LiveMonitor of monitor.py. Level-triggered: a
 * pass compares what is wanted with what this monitor has started, whatever happened since, then
 * the next pass is armed only after this one ends, so passes never overlap.
 */
@Injectable()
export class MonitorSupervisor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorSupervisor.name);
  private selection: MonitorSelection | null = null;
  /** Channels this monitor started, or adopted because their job already ran. */
  private started = new Set<string>();
  /** Aborted when the monitor stops: ends the chain and the pass in flight. */
  private session: AbortController | null = null;
  /** Aborted to cut the pass in flight short, so a changed selection applies at once. */
  private passWake: AbortController | null = null;
  private passing: Promise<void> | null = null;
  /** The latest pass of any run: a run that follows an ended one waits for it, so two passes never overlap. */
  private lastPass: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private lastError = '';

  constructor(
    private readonly directory: ChannelDirectory,
    private readonly detection: DetectionService,
    private readonly control: DetectionControl,
  ) {}

  onModuleInit(): void {
    this.control.onRename((oldKey, newKey) => this.followRename(oldKey, newKey));
  }

  /** The jobs are left to the detection module, which stops its own on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.end(false);
  }

  get current(): MonitorSelection | null {
    return this.selection;
  }

  /** Starts monitoring, or changes what a running monitor watches; the change applies on the next pass, which runs at once. */
  begin(selection: MonitorSelection): void {
    this.selection = selection;
    if (this.session) {
      this.logger.log(MonitorEvent.updated);
      this.wake();
      return;
    }
    this.session = new AbortController();
    this.started = new Set();
    this.logger.log(MonitorEvent.started);
    this.schedule(this.session, 0);
  }

  /**
   * Stops monitoring and the jobs it started; an end that is already over does nothing. It does
   * not wait for a pass in flight: that pass stops what it starts once it sees the monitor is over.
   */
  async end(stopJobs = true): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.selection = null;
    session.abort();
    this.passWake?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const keys = [...this.started];
    this.started = new Set();
    if (stopJobs) await Promise.all(keys.map((key) => this.detection.stop(key)));
    this.logger.log(MonitorEvent.stopped);
  }

  private followRename(oldKey: string, newKey: string): void {
    const keys = this.selection?.keys;
    if (!this.selection || !keys?.has(oldKey)) return;
    const moved = new Set(keys);
    moved.delete(oldKey);
    moved.add(newKey);
    this.selection = { ...this.selection, keys: moved };
    this.wake();
  }

  private wake(): void {
    if (this.passing) this.passWake?.abort();
    else if (this.session) this.schedule(this.session, 0);
  }

  private schedule(session: AbortController, delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(session), delayMs);
    this.timer.unref();
  }

  private async tick(session: AbortController): Promise<void> {
    await this.lastPass;
    if (session.signal.aborted) return;
    const wake = new AbortController();
    this.passWake = wake;
    const pass = this.pass(
      session.signal,
      AbortSignal.any([session.signal, wake.signal]),
      this.started,
    );
    this.lastPass = pass;
    this.passing = pass;
    await pass;
    if (this.passing === pass) this.passing = null;
    if (session.signal.aborted) return;
    this.schedule(session, wake.signal.aborted ? 0 : MONITOR_PASS_MS);
  }

  /**
   * One pass; whatever goes wrong in it is logged, because the next pass is the retry. `stopped`
   * ends with the monitor, `signal` also with a changed selection. `started` belongs to this
   * monitor run, so a pass that outlives it cannot touch the next run's set.
   */
  private async pass(
    stopped: AbortSignal,
    signal: AbortSignal,
    started: Set<string>,
  ): Promise<void> {
    try {
      const selection = this.selection;
      if (!selection) return;
      const wanted = await this.wanted(selection);
      if (!wanted || signal.aborted) return;
      const { stop, start } = diffMonitor(wanted.keys(), started);
      for (const key of stop) started.delete(key);
      await Promise.all(stop.map((key) => this.detection.stop(key)));
      let pause = false;
      for (const key of start) {
        if (pause && !(await abortableSleep(MONITOR_START_STAGGER_MS, signal))) return;
        if (signal.aborted) return;
        const channel = wanted.get(key);
        if (!channel) continue;
        pause = !(await this.startOne(channel, started, stopped));
      }
    } catch (error) {
      this.logger.error(`Monitor pass failed: ${safeError(errorMessage(error))}`);
    }
  }

  /** The channels wanted now, or null when the list cannot be read: the pass is skipped and nothing is stopped. */
  private async wanted(selection: MonitorSelection): Promise<Map<string, Channel> | null> {
    try {
      const wanted = selectChannels(await this.directory.channels(), selection);
      this.lastError = '';
      return wanted;
    } catch (error) {
      const reason = safeError(errorMessage(error));
      if (reason !== this.lastError) this.logger.warn(`${MonitorEvent.configError}: ${reason}`);
      this.lastError = reason;
      return null;
    }
  }

  /** True when the channel needed no start: a job of its own was already running and is adopted. */
  private async startOne(
    channel: Channel,
    started: Set<string>,
    stopped: AbortSignal,
  ): Promise<boolean> {
    started.add(channel.key);
    if (this.detection.isActive(channel.key)) return true;
    try {
      await this.detection.startChannel(channel);
      // The monitor ended while the job was starting, after its stop pass took the list: stop it here.
      if (stopped.aborted) await this.detection.stop(channel.key);
    } catch (error) {
      started.delete(channel.key);
      this.logger.warn(`Cannot start ${channel.key}: ${safeError(errorMessage(error))}`);
    }
    return false;
  }
}
