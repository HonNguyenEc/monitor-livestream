import { CookieStore } from './shop-record.model';

export interface RememberedCookie {
  cookies: CookieStore;
  /** Puts the previous value back, or deletes the key when there was none; best effort, for when the write that follows fails. */
  undo: () => Promise<void>;
}
