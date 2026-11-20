/** The play_url answer of livestream-backend; `playUrl` is empty unless the session is live. */
export interface PlayUrlAnswer {
  sessionId: string;
  shopeeStatus: number | null;
  isLive: boolean;
  title: string | null;
  shareUrl: string | null;
  playUrl: string;
  expiresAt: string | null;
}
