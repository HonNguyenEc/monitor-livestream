/** What the outbound clients and runners of the test app are replaced with: a call throws instead of reaching the network or starting a process, except where a fake says otherwise. */
export const NOT_REACHABLE_MESSAGE = 'The network is not reachable from tests';
export const NOT_RUNNABLE_MESSAGE = 'No process may start from tests';

export async function rejectNetwork(): Promise<never> {
  throw new Error(NOT_REACHABLE_MESSAGE);
}

export function rejectProcess(): never {
  throw new Error(NOT_RUNNABLE_MESSAGE);
}

async function rejectProcessAsync(): Promise<never> {
  return rejectProcess();
}

export const fakeTikTokRoomClient = { fetchRoom: rejectNetwork };

export const fakeSellerCenterClient = {
  account: rejectNetwork,
  sessionFromLink: rejectNetwork,
  ongoingLive: rejectNetwork,
  sessionInfo: rejectNetwork,
  loginUserId: rejectNetwork,
};

export const fakeYtDlpRunner = { run: rejectNetwork };

export const fakePlayerLocator = {
  find: rejectProcessAsync,
};

export const fakeChildProcessRegistry = {
  onModuleInit: () => Promise.resolve(),
  onModuleDestroy: () => Promise.resolve(),
  launch: rejectProcess,
  kill: () => Promise.resolve(),
  killAll: () => Promise.resolve(),
  sweepOrphans: () => Promise.resolve(),
};

/** FFmpeg is installed, but a grab throws like an unexpected failure; a test that wants frames passes its own grabber. */
export const fakeFrameGrabber = {
  available: () => Promise.resolve(true),
  grab: rejectProcessAsync,
};

/** Building an mpv IPC client fails: a test that launches a fake player passes its own factory. */
export const fakeMpvIpcFactory = rejectProcess;

/** No mpv is installed, whatever the developer machine has. */
export const fakeMpvPlayerProvider = { get: () => Promise.resolve(null), forget: () => undefined };
