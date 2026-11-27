import { MpvIpcClient } from './mpv-ipc-client';

/** Builds the IPC client of one launch; a job owns its client, so this is a factory and not a shared instance. */
export type MpvIpcClientFactory = (pipePath: string) => MpvIpcClient;

export const MPV_IPC_CLIENT_FACTORY = Symbol('MPV_IPC_CLIENT_FACTORY');

export const createMpvIpcClient: MpvIpcClientFactory = (pipePath) => new MpvIpcClient(pipePath);
