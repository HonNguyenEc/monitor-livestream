import { LOCAL_HOSTNAMES } from '../constants/app.constants';
import { DIGITS } from '../constants/patterns.constants';

const MASK = '•••';
const EMAIL_SEPARATOR = '@';
const LONG_LOCAL_PART = 3;
const LONG_LOCAL_KEPT = 2;
const SHORT_LOCAL_KEPT = 1;
const HOST_PREFIX_LENGTH = 3;
const KEPT_HOST_LABELS = 3;
const ID_KEPT = 4;

/** `admin@example.com` → `ad•••@example.com`; empty when there is no local part. */
export function maskEmail(email: string): string {
  const at = email.indexOf(EMAIL_SEPARATOR);
  const local = at < 0 ? email : email.slice(0, at);
  if (!local) {
    return '';
  }
  const kept = local.slice(0, local.length > LONG_LOCAL_PART ? LONG_LOCAL_KEPT : SHORT_LOCAL_KEPT);
  return `${kept}${MASK}${at < 0 ? '' : email.slice(at)}`;
}

/** `https://auto.example.vn` → `https://aut•••.example.vn`; loopback hosts stay readable. For display only. */
export function maskUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  const host = parsed.hostname;
  if (!host) {
    return '';
  }
  const scheme = parsed.protocol.slice(0, -1);
  return `${scheme}://${LOCAL_HOSTNAMES.includes(host) ? host : maskHost(host)}`;
}

function maskHost(host: string): string {
  const labels = host.split('.');
  if (labels.every((label) => DIGITS.test(label))) {
    return `${labels[0]}.${MASK}.${MASK}.${labels[labels.length - 1]}`;
  }
  const first = `${labels[0].slice(0, HOST_PREFIX_LENGTH)}${MASK}`;
  return [first, ...labels.slice(1)].slice(-KEPT_HOST_LABELS).join('.');
}

/** Long ids (session, brand) keep only their last 4 characters, e.g. `•••6215`; short ones stay as they are. */
export function maskId(id: string): string {
  return id.length > ID_KEPT ? `${MASK}${id.slice(-ID_KEPT)}` : id;
}
