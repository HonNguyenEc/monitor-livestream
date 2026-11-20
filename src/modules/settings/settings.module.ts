import { Module } from '@nestjs/common';

import { LayoutSettingsRepository } from './repositories/layout-settings.repository';
import { LayoutSettingsStore } from './services/layout-settings.store';

/** Leaf module: persisted settings that detection, layout and wall read. */
@Module({
  providers: [LayoutSettingsStore, LayoutSettingsRepository],
  exports: [LayoutSettingsStore],
})
export class SettingsModule {}
