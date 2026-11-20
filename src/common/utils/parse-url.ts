/** The URL, or null when `value` is not one (relative to `base` when given). */
export function parseUrl(value: string, base?: URL): URL | null {
  return URL.parse(value, base);
}
