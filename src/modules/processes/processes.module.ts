import { Module } from '@nestjs/common';

import { ChildProcessRegistry } from './services/child-process-registry.service';
import { ToolLocator } from './services/tool-locator.service';

/** Leaf module: owns the player processes the service starts and finds the tools it runs. */
@Module({
  providers: [ChildProcessRegistry, ToolLocator],
  exports: [ChildProcessRegistry, ToolLocator],
})
export class ProcessesModule {}
