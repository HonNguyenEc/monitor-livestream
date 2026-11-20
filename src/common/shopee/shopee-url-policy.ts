import { SHOPEE_ALLOWED_DOMAINS, SHOPEE_ALLOWED_PROTOCOL } from './shopee-url.constants';

/** https only, and the host must be an allowed domain itself or one of its subdomains (never a substring match). */
export function isAllowedShopeeUrl(url: URL): boolean {
  if (url.protocol !== SHOPEE_ALLOWED_PROTOCOL) return false;
  return SHOPEE_ALLOWED_DOMAINS.some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
}
