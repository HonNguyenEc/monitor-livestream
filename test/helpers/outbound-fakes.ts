/** What every outbound client and runner is replaced with: a call fails loudly instead of reaching the network or starting a process. */
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
