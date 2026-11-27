import { Module } from '@nestjs/common';

import { DetectionControl } from './services/detection-control';
import { DetectionStateStore } from './services/detection-state.store';

/** Leaf module: shops, layout, wall and detection all depend on it, it depends on none of them. */
@Module({
  providers: [DetectionStateStore, DetectionControl],
  exports: [DetectionStateStore, DetectionControl],
})
export class DetectionStateModule {}
