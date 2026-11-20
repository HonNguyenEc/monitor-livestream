import { LayoutSettings } from './layout-settings.model';

/** What one saved update replaced and what it left; both read inside the write lock. */
export interface LayoutSettingsChange {
  previous: LayoutSettings;
  next: LayoutSettings;
}
