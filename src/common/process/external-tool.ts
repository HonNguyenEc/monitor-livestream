import { WINDOWS_EXE_SUFFIX } from './process.constants';

/** The tools found in the tools folder or on PATH; mpv has its own lookup (PlayerLocator). */
export enum ExternalTool {
  YTDLP = 'yt-dlp',
  FFMPEG = 'ffmpeg',
}

export const toolFileName = (
  tool: ExternalTool,
  platform: NodeJS.Platform = process.platform,
): string => (platform === 'win32' ? `${tool}${WINDOWS_EXE_SUFFIX}` : tool);
