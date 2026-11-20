export class BackendStatusDto {
  connected: boolean;
  /** Scheme and masked host of livestream-backend, e.g. `https://aut•••.example.vn`. */
  backend: string;
  /** Masked login email, e.g. `ad•••@example.com`; empty while disconnected. */
  email: string;
  name: string;
  role: string;
  synced_at: string | null;
  error: string | null;
  brands: number;
  schedules: number;
  api_calls_5m: number;
}
