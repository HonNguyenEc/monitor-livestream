import { MSG_CANCELLED } from '../constants/resolver.constants';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';

export interface ResolveSuccess {
  ok: true;
  /** Playable URLs; the TikTok room path lists FLV before HLS, yt-dlp keeps its own order. */
  urls: string[];
  detail: string;
}

export interface ResolveFailure {
  ok: false;
  code: ResolveFailureCode;
  /** Text of the form `<code>: <message>`, except what failedRaw builds: the masked yt-dlp text of `ytdlp_failed` (which the TikTok resolver prefixes with why the room API failed) and the backend cache note. */
  detail: string;
}

export type ResolveResult = ResolveSuccess | ResolveFailure;

export function resolved(urls: string[], detail: string): ResolveSuccess {
  return { ok: true, urls, detail };
}

export function failed(code: ResolveFailureCode, message: string): ResolveFailure {
  return { ok: false, code, detail: `${code}: ${message}` };
}

/** A failure whose detail is used as given; the caller owns masking and any prefix. */
export function failedRaw(code: ResolveFailureCode, detail: string): ResolveFailure {
  return { ok: false, code, detail };
}

/** A resolve the caller aborted; it says nothing about the channel. */
export function cancelled(): ResolveFailure {
  return failed(ResolveFailureCode.CANCELLED, MSG_CANCELLED);
}
