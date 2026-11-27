import { BackendLoginState } from '../../src/modules/backend/models/backend-login-state.model';

/** A login whose epoch changes with every connect or disconnect, as the real one does. */
export class FakeLoginState implements BackendLoginState {
  epoch = 0;
  private isConnected: boolean;

  constructor(connected = true) {
    this.isConnected = connected;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  set connected(value: boolean) {
    if (value !== this.isConnected) this.epoch += 1;
    this.isConnected = value;
  }

  /** A new login or a logout-login pair: ends the epoch without changing `connected`. */
  relogin(): void {
    this.epoch += 1;
  }
}
