export class SessionInfoDto {
  session_id: string;
  shopee_status: number | null;
  is_live: boolean;
  title: string | null;
  share_url: string | null;
  expires_at: string | null;
  source: string;
  schedule_id: string | null;
  checked_at: string;
}
