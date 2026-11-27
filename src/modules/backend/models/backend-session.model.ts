export interface BackendUser {
  id: number | null;
  email: string;
  name: string;
  role: string;
}

/** backend_session.json, in the Python tool's layout. Never log the tokens. */
export interface BackendSession {
  base_url: string;
  access_token: string;
  refresh_token: string;
  user: BackendUser;
}

export interface BackendTokens {
  access_token: string;
  refresh_token: string;
}
