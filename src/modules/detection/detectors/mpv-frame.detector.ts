import { ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { abortableSleep } from '../../../common/concurrency/abortable-sleep';
import { raceAbort } from '../../../common/concurrency/race-abort';
import { Detector } from '../../../common/enums/detector.enum';
import { replaceFileWith } from '../../../common/fs/replace-file-with';
import { errorMessage } from '../../../common/utils/error-message';
import { safeError } from '../../../common/utils/safe-error';
import { DATA_DIR } from '../../../config/data-dir.module';
import { mpvConfigDirOf } from '../../../config/runtime-artifacts';
import {
  MPV_IPC_CLIENT_FACTORY,
  MpvIpcClient,
  MpvIpcClientFactory,
  MpvPlayerProvider,
  mpvLaunchArgs,
  mpvPipePath,
  newLaunchId,
} from '../../players';
import { ChildProcessRegistry } from '../../processes';
import { LayoutSettingsStore } from '../../settings';
import {
  FIRST_FRAME_POLL_MS,
  IMAGE_CHECK_MS,
  MPV_TITLE_PREFIX,
  PLAYING_CHECK_MS,
} from '../constants/detection.constants';
import { DetectorEnd, DetectorRun, FrameDetector } from './frame-detector.interface';

/** What one mpv launch lets the watch loop ask: frames shown so far, and a picture of the current one. */
interface Session {
  frames(): Promise<number>;
  snapshot(): Promise<boolean>;
  /** Aborts when the job stops or mpv exits. */
  over: AbortSignal;
  /** Aborts when the job stops. */
  stopped: AbortSignal;
  /** The IPC or file failure since the last good answer, unless the player ending caused it, masked; null when there was none. */
  lastError(): string | null;
}

/**
 * `_wait_for_image` and `_watch_playing` of mpv_retry.py: a player that keeps the stream open,
 * asked over IPC how many frames it has shown. The first frame must come within 20 s; while
 * playing, a count that has not grown since the last 30 s check is a stall. IPC trouble counts as
 * no frames, never as an error.
 */
@Injectable()
export class MpvFrameDetector implements FrameDetector {
  readonly kind = Detector.MPV;
  private readonly logger = new Logger(MpvFrameDetector.name);

  constructor(
    private readonly player: MpvPlayerProvider,
    private readonly processes: ChildProcessRegistry,
    @Inject(MPV_IPC_CLIENT_FACTORY) private readonly createIpc: MpvIpcClientFactory,
    private readonly settings: LayoutSettingsStore,
    @Inject(DATA_DIR) private readonly dataDir: string,
  ) {}

  async available(): Promise<boolean> {
    return (await this.player.get()) !== null;
  }

  async run(run: DetectorRun): Promise<DetectorEnd> {
    const mpv = await this.player.get();
    if (!mpv) return DetectorEnd.TOOL_MISSING;
    const { show_mpv: show } = await this.settings.get();
    const { channel, signal } = run;
    const configDir = mpvConfigDirOf(this.dataDir, channel.key);
    await mkdir(configDir, { recursive: true });
    const pipePath = mpvPipePath(newLaunchId(), channel.key);
    const args = mpvLaunchArgs({
      player: mpv,
      configDir,
      pipePath,
      hidden: !show,
      title: `${MPV_TITLE_PREFIX}${channel.label}`,
      url: run.url,
    });
    // A job stopped while it looked for the player or read the settings must not start one.
    if (signal.aborted) return DetectorEnd.STOPPED;
    const child = this.launch(mpv.path, args);
    if (!child) return DetectorEnd.PLAYER_FAILED;
    const ipc = this.createIpc(pipePath);
    const exited = new AbortController();
    child.once('exit', () => exited.abort());
    child.once('error', () => exited.abort());
    try {
      const session = this.session(ipc, run.framePath, signal, exited.signal);
      const end = await this.watch(run, session);
      this.explain(channel.key, end, child, session.lastError());
      return end;
    } finally {
      ipc.close();
      if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
        await this.processes.kill(child.pid);
      }
    }
  }

  private launch(file: string, args: string[]): ChildProcess | null {
    try {
      const child = this.processes.launch(file, args);
      if (child.pid !== undefined) return child;
    } catch (error) {
      this.logger.warn(`Cannot start mpv: ${safeError(errorMessage(error))}`);
    }
    this.player.forget();
    return null;
  }

  private session(
    ipc: MpvIpcClient,
    framePath: string,
    jobSignal: AbortSignal,
    exitSignal: AbortSignal,
  ): Session {
    const over = AbortSignal.any([jobSignal, exitSignal]);
    let ipcError: string | null = null;
    const ask = async <T>(question: () => Promise<T>, otherwise: T): Promise<T> => {
      try {
        const answer = await raceAbort(question(), over);
        ipcError = null;
        return answer;
      } catch (error) {
        if (!over.aborted) ipcError = safeError(errorMessage(error));
        return otherwise;
      }
    };
    return {
      over,
      stopped: jobSignal,
      lastError: () => ipcError,
      frames: () =>
        ask(async () => {
          await ipc.connect();
          return ipc.framesShown();
        }, 0),
      snapshot: () =>
        ask(() => replaceFileWith(framePath, (temp) => ipc.screenshotToFile(temp)), false),
    };
  }

  private async watch(
    { report, channel: { key } }: DetectorRun,
    session: Session,
  ): Promise<DetectorEnd> {
    report.checking();
    let last = await this.firstFrames(session);
    if (last === 0) return this.ended(session, DetectorEnd.NO_SIGNAL);
    let saveFailureLogged = false;
    for (;;) {
      const saved = await session.snapshot();
      if (!saved && !saveFailureLogged && !session.over.aborted) {
        saveFailureLogged = true;
        this.logger.warn(
          `mpv of ${key} could not save a frame picture: ${session.lastError() ?? 'no answer'}`,
        );
      }
      report.frame(saved);
      if (!(await abortableSleep(PLAYING_CHECK_MS, session.over))) break;
      const now = await session.frames();
      if (now <= last) break;
      last = now;
    }
    return this.ended(session, DetectorEnd.LOST_FRAMES);
  }

  /** Polls once a second for up to 20 s; 0 when no frame came, or the player or the job ended first. */
  private async firstFrames(session: Session): Promise<number> {
    const deadline = Date.now() + IMAGE_CHECK_MS;
    while (Date.now() < deadline && (await abortableSleep(FIRST_FRAME_POLL_MS, session.over))) {
      const frames = await untilDeadline(session.frames(), deadline);
      if (frames > 0) return frames;
    }
    return 0;
  }

  /** Says why a run ended without the stream ending it: the cause is otherwise invisible, since both outcomes carry no reason. */
  private explain(
    key: string,
    end: DetectorEnd,
    child: ChildProcess,
    ipcError: string | null,
  ): void {
    if (end !== DetectorEnd.NO_SIGNAL && end !== DetectorEnd.LOST_FRAMES) return;
    const why =
      child.exitCode !== null
        ? `the player exited with code ${child.exitCode}`
        : (ipcError ?? 'no frame count change');
    const text = `mpv of ${key}: ${end}, ${why}`;
    if (end === DetectorEnd.NO_SIGNAL) this.logger.warn(text);
    else this.logger.log(text);
  }

  /** A stop beats whatever else ended the run. */
  private ended(session: Session, otherwise: DetectorEnd): DetectorEnd {
    return session.stopped.aborted ? DetectorEnd.STOPPED : otherwise;
  }
}

// A pipe connect (10 s) plus a request (3 s) must not stretch the 20 s first-frame window.
function untilDeadline(frames: Promise<number>, deadline: number): Promise<number> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()), 0);
    void frames.then(resolve).finally(() => clearTimeout(timer));
  });
}
