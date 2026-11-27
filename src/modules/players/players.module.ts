import { Module } from '@nestjs/common';

import { ProcessesModule } from '../processes';
import { createMpvIpcClient, MPV_IPC_CLIENT_FACTORY } from './services/mpv-ipc-client.factory';
import { MpvPlayerProvider } from './services/mpv-player.provider';
import { PlayerLocator } from './services/player-locator.service';
import { UninstallRegistry } from './services/uninstall-registry.service';

@Module({
  imports: [ProcessesModule],
  providers: [
    PlayerLocator,
    UninstallRegistry,
    MpvPlayerProvider,
    { provide: MPV_IPC_CLIENT_FACTORY, useValue: createMpvIpcClient },
  ],
  exports: [PlayerLocator, MpvPlayerProvider, MPV_IPC_CLIENT_FACTORY, ProcessesModule],
})
export class PlayersModule {}
