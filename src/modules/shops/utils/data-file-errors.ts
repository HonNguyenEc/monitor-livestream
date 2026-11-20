import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';

const hasCode = (error: unknown, code: ErrorCode): boolean =>
  error instanceof DomainException && error.code === code;

/** shopee_cookies.json cannot be read: that is not a missing cookie. */
export const isCookieStoreUnreadable = (error: unknown): boolean =>
  hasCode(error, ErrorCode.COOKIES_FILE_UNREADABLE);

/** shops.json cannot be read: the channel list is unknown, not empty. */
export const isShopsFileUnreadable = (error: unknown): boolean =>
  hasCode(error, ErrorCode.SHOPS_FILE_UNREADABLE);
