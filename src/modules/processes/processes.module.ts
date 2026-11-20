import { Module } from '@nestjs/common';

import { ChildProcessRegistry } from './services/child-process-registry.service';

/** Leaf module: owns the player processes the service starts. */
@Module({
  providers: [ChildProcessRegistry],
  exports: [ChildProcessRegistry],
})
export class ProcessesModule {}
