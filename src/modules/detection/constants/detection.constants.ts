import { MS_PER_SECOND } from '../../../common/constants/time.constants';
import { Platform } from '../../../common/enums/platform.enum';

/** What yt-dlp prints for a channel that is not live. Python's other marker, `not_live`, prefixes its own resolvers' messages, which are reason codes here. */
export const YTDLP_NOT_LIVE_MARKER = 'not currently live';

export const FRAME_CONTENT_TYPE = 'image/jpeg';

/** How long a stream may take to show its first frame; also the time limit of one FFmpeg grab. */
export const IMAGE_CHECK_MS = 20 * MS_PER_SECOND;
/** Frames of a playing stream are checked again this often. */
export const PLAYING_CHECK_MS = 30 * MS_PER_SECOND;
/** The first frame is asked for once a second, as Python does. */
export const FIRST_FRAME_POLL_MS = MS_PER_SECOND;
export const MPV_TITLE_PREFIX = 'Livestream ';
/** Wait after frames stopped or the player exited, so a closed window is not reopened at once. */
export const LOST_FRAMES_DELAY_MS = 3 * MS_PER_SECOND;
export const NO_SIGNAL_DELAY_MS = 3 * MS_PER_SECOND;

/** Misses in a row before a channel that was live stops reporting live. */
export const LIVE_GRACE_MISSES = 2;

/** Wait after a failed resolve; Shopee is slower so its anti-bot gate is not hammered. */
export const FAILED_RESOLVE_DELAY_MS: Record<Platform, number> = {
  [Platform.TIKTOK]: 5 * MS_PER_SECOND,
  [Platform.SHOPEE]: 15 * MS_PER_SECOND,
};
/** Wait after the platform said the channel is not live. */
export const OFFLINE_DELAY_MS: Record<Platform, number> = {
  [Platform.TIKTOK]: 20 * MS_PER_SECOND,
  [Platform.SHOPEE]: 60 * MS_PER_SECOND,
};

/** Cookie failures in a row, same cookie, before a job waits for the cookie to change; the live grace misses, so a parked channel is already reported by then. */
export const COOKIE_PARK_AFTER_MISSES = LIVE_GRACE_MISSES;
export const COOKIE_PARK_POLL_MS = 5 * MS_PER_SECOND;

/** Waits after the 2nd, 3rd and later unexpected failure in a row; the 1st uses the normal retry delay. */
export const INTERNAL_ERROR_BACKOFF_MS: readonly number[] = [
  30 * MS_PER_SECOND,
  60 * MS_PER_SECOND,
];

/** How often the manager looks for jobs whose channel is gone or whose login ended. */
export const GONE_SWEEP_MS = 30 * MS_PER_SECOND;
/** Longest a stop waits for a job to release its processes. */
export const STOP_WAIT_MS = 5 * MS_PER_SECOND;
