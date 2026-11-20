import { Module } from '@nestjs/common';

import { ProcessesModule } from '../processes';
import { PlayerLocator } from './services/player-locator.service';
import { UninstallRegistry } from './services/uninstall-registry.service';

@Module({
  imports: [ProcessesModule],
  providers: [PlayerLocator, UninstallRegistry],
  exports: [PlayerLocator, ProcessesModule],
})
export class PlayersModule {}
