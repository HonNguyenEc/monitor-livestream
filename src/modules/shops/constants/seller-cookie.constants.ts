import { SELLER_CENTER_COOKIE_NAME } from '../../shopee';

// extract_seller_cookie in shop_store.py: the value of SPC_SC_SESSION in a pasted `cookie` header.
export const SELLER_CENTER_COOKIE_PATTERN = new RegExp(
  `(?:^|[;\\s])${SELLER_CENTER_COOKIE_NAME}=([^;\\s]+)`,
);
export const PASTED_COOKIE_PREFIX = 'cookie:';
