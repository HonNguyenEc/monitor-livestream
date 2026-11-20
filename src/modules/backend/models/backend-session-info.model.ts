/** What the last play_url answer said about a brand's session; the play URL itself is never kept. */
export interface BackendSessionInfo {
  /** Masked: only the last 4 characters. */
  sessionId: string;
  shopeeStatus: number | null;
  isLive: boolean;
  title: string | null;
  shareUrl: string | null;
  expiresAt: string | null;
  source: string;
  scheduleId: string | null;
  checkedAt: string;
}
