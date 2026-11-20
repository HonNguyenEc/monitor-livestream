/** What the synced lists and the play URL lookups need to know about the login; an abstract class so Nest can inject it. */
export abstract class BackendLoginState {
  abstract readonly connected: boolean;
  /** Changes whenever the login changes (login, logout, a refused refresh), never when tokens rotate: an answer fetched under another epoch is stale. */
  abstract readonly epoch: number;
}
