import { Module } from '@nestjs/common';

import { PlayerLocator } from './services/player-locator.service';
import { UninstallRegistry } from './services/uninstall-registry.service';

@Module({
  providers: [PlayerLocator, UninstallRegistry],
  exports: [PlayerLocator],
})
export class PlayersModule {}
