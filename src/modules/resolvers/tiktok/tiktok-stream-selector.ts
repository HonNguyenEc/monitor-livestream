import { isPlainObject } from '../../../common/utils/is-plain-object';
import { TIKTOK_QUALITIES, TIKTOK_STREAM_KINDS } from './tiktok.constants';

export interface TikTokStreamChoice {
  quality: string;
  /** FLV first, then HLS. */
  urls: string[];
}

type JsonObject = Record<string, unknown>;

function parseQualities(room: JsonObject): JsonObject {
  const streamData = room['streamData'];
  const pullData = isPlainObject(streamData) ? streamData['pull_data'] : undefined;
  const raw = isPlainObject(pullData) ? pullData['stream_data'] : undefined;
  if (typeof raw !== 'string') return {};
  try {
    // TikTok embeds the qualities JSON as a string inside the room payload.
    const parsed: unknown = JSON.parse(raw);
    const data = isPlainObject(parsed) ? parsed['data'] : undefined;
    return isPlainObject(data) ? data : {};
  } catch {
    return {};
  }
}

/** Walks the qualities best first; the first one with an FLV and/or HLS URL wins. Malformed shapes yield null. */
export function selectTikTokStream(room: JsonObject): TikTokStreamChoice | null {
  const qualities = parseQualities(room);
  for (const quality of TIKTOK_QUALITIES) {
    const entry = qualities[quality];
    const main = isPlainObject(entry) ? entry['main'] : undefined;
    if (!isPlainObject(main)) continue;
    const urls = TIKTOK_STREAM_KINDS.map((kind) => main[kind]).filter(
      (url): url is string => typeof url === 'string' && url.length > 0,
    );
    if (urls.length > 0) return { quality, urls };
  }
  return null;
}
