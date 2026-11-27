import { MS_PER_SECOND } from '../../../common/constants/time.constants';

/** ffmpeg's -rw_timeout is in microseconds. */
const RW_TIMEOUT_US = 10 * MS_PER_SECOND * MS_PER_SECOND;

export const FFMPEG_LOG_CONTEXT = 'FfmpegFrameGrabber';

/** One frame of `url` into `output`, as media.grab_frame of the Python tool. */
export const ffmpegFrameArgs = (url: string, output: string): string[] => [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-rw_timeout',
  String(RW_TIMEOUT_US),
  '-i',
  url,
  '-frames:v',
  '1',
  output,
];

/** How much of ffmpeg's error text goes to the log. */
export const STDERR_LOG_CHARS = 300;
