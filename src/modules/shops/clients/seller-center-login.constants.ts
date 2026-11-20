export const SELLER_CENTER_ORIGIN = 'https://banhang.shopee.vn';
export const SELLER_CENTER_LOGIN_URL = `${SELLER_CENTER_ORIGIN}/api/v2/login/`;
export const SELLER_CENTER_TIMEOUT_MS = 25_000;
export const SELLER_CENTER_HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  referer: `${SELLER_CENTER_ORIGIN}/`,
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};
export const COOKIE_HEADER = 'cookie';
