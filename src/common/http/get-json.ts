import { MAX_JSON_RESPONSE_BYTES, MSG_RESPONSE_TOO_LARGE } from '../constants/http.constants';
import { isPlainObject } from '../utils/is-plain-object';

export interface JsonResponse {
  status: number;
  /** Parsed JSON object; `{}` when the body is not a JSON object. */
  data: Record<string, unknown>;
  /** Set when the body was not a JSON object, so callers can tell it from a genuine `{}`. */
  invalidBody?: true;
}

/** GET `url` and return the status with the JSON body; a body over MAX_JSON_RESPONSE_BYTES counts as invalid. Network errors and timeouts throw. */
export async function getJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<JsonResponse> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const body = await readCapped(response);
  try {
    if (body === null) throw new Error(MSG_RESPONSE_TOO_LARGE);
    const parsed: unknown = JSON.parse(body);
    if (isPlainObject(parsed)) return { status: response.status, data: parsed };
  } catch {
    // A body that is not JSON is reported through invalidBody below.
  }
  return { status: response.status, data: {}, invalidBody: true };
}

/** The body as text, or null once it exceeds `maxBytes`; the rest of the stream is never read. */
export async function readCapped(
  response: Response,
  maxBytes = MAX_JSON_RESPONSE_BYTES,
): Promise<string | null> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    received += chunk.value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}
