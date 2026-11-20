import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { cookieChanged, isCookieFailure } from './cookie-failure';

describe('isCookieFailure', () => {
  it.each([
    [ReasonCode.COOKIE_MISSING, true],
    [ReasonCode.COOKIE_INVALID, true],
    [ReasonCode.COOKIE_STORE_UNREADABLE, true],
    [ReasonCode.SELLER_CENTER_NO_ACCESS, false],
    [ReasonCode.PLATFORM_UNREACHABLE, false],
    [null, false],
  ])('%s is %s', (reason, expected) => {
    expect(isCookieFailure(reason)).toBe(expected);
  });
});

describe('cookieChanged', () => {
  const readable = (
    cookie: string | undefined,
  ): { readable: boolean; cookie: string | undefined } => ({
    readable: true,
    cookie,
  });

  it('never changes while the store cannot be read', () => {
    expect(
      cookieChanged(ReasonCode.COOKIE_INVALID, 'a', { readable: false, cookie: undefined }),
    ).toBe(false);
  });

  it('an unreadable store is ready as soon as it reads again', () => {
    expect(cookieChanged(ReasonCode.COOKIE_STORE_UNREADABLE, undefined, readable(undefined))).toBe(
      true,
    );
  });

  it('a missing cookie is ready once one is stored', () => {
    expect(cookieChanged(ReasonCode.COOKIE_MISSING, undefined, readable(undefined))).toBe(false);
    expect(cookieChanged(ReasonCode.COOKIE_MISSING, undefined, readable('SPC_SC_SESSION=x'))).toBe(
      true,
    );
  });

  it('a refused cookie is ready once the stored one differs', () => {
    expect(cookieChanged(ReasonCode.COOKIE_INVALID, 'old', readable('old'))).toBe(false);
    expect(cookieChanged(ReasonCode.COOKIE_INVALID, 'old', readable('new'))).toBe(true);
    expect(cookieChanged(ReasonCode.COOKIE_INVALID, 'old', readable(undefined))).toBe(true);
  });
});
