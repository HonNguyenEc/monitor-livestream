import { Logger } from '@nestjs/common';

import { DomainException } from '../../../common/exceptions/domain.exception';
import { SellerCenterClient } from '../../shopee/clients/seller-center.client';
import { SellerCenterUnavailableError } from '../../shopee/errors/seller-center-unavailable.error';
import { SellerAccount } from '../../shopee/models/seller-account.model';
import { extractSellerCookie, SellerAccountService } from './seller-account.service';

const ACCOUNT: SellerAccount = { user_id: 11, shop_id: 22, username: 'seller' };

describe('extractSellerCookie (extract_seller_cookie of the Python tool)', () => {
  it.each([
    ['SPC_SC_SESSION=abc', 'SPC_SC_SESSION=abc'],
    ['cookie: a=1; SPC_SC_SESSION=abc.def; b=2', 'SPC_SC_SESSION=abc.def'],
    ['  SPC_EC=x;SPC_SC_SESSION=v1  ', 'SPC_SC_SESSION=v1'],
    ['Cookie: SPC_SC_SESSION=v2', 'SPC_SC_SESSION=v2'],
    ['cookie:SPC_SC_SESSION=v4', 'SPC_SC_SESSION=v4'],
    ['a=1\tSPC_SC_SESSION=t;', 'SPC_SC_SESSION=t'],
  ])('keeps only SPC_SC_SESSION from %p', (pasted, cookie) => {
    expect(extractSellerCookie(pasted)).toBe(cookie);
  });

  it.each(['Cookie:SPC_SC_SESSION=v3', 'XSPC_SC_SESSION=1', 'SPC_SC_SESSION=', 'a=1; b=2'])(
    'rejects %p',
    (pasted) => {
      expect(() => extractSellerCookie(pasted)).toThrow(DomainException);
    },
  );
});

describe('extractSellerCookie with characters a header cannot carry', () => {
  it.each(['SPC_SC_SESSION=aĀb', 'SPC_SC_SESSION=café', 'SPC_SC_SESSION=ab'])(
    'rejects %j with a message that never echoes the value',
    (pasted) => {
      expect.assertions(2);
      try {
        extractSellerCookie(pasted);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainException);
        expect((error as DomainException).message).not.toContain(pasted.split('=')[1]);
      }
    },
  );

  it('stops the value at CR/LF so a pasted line break never reaches the header', () => {
    expect(extractSellerCookie('SPC_SC_SESSION=abc\r\nx-evil: 1')).toBe('SPC_SC_SESSION=abc');
  });
});

describe('SellerAccountService', () => {
  const account = jest.fn<Promise<SellerAccount | null>, [string]>();
  const service = new SellerAccountService({ account } as unknown as SellerCenterClient);

  beforeEach(() => account.mockReset());

  it('verifies the extracted cookie, never the pasted header', async () => {
    account.mockResolvedValue(ACCOUNT);

    expect(await service.verify('a=1; SPC_SC_SESSION=x; b=2')).toEqual({
      cookie: 'SPC_SC_SESSION=x',
      account: ACCOUNT,
    });
    expect(account).toHaveBeenCalledWith('SPC_SC_SESSION=x');
  });

  it('lets a programming error through instead of calling it an outage', async () => {
    account.mockRejectedValue(new TypeError('bug'));

    await expect(service.verify('SPC_SC_SESSION=x')).rejects.toThrow(TypeError);
  });

  it.each([
    ['a rejected cookie', (): unknown => account.mockResolvedValue(null), /từ chối cookie/],
    [
      'an unreachable Seller Center',
      (): unknown => account.mockRejectedValue(new SellerCenterUnavailableError('down')),
      /Không kết nối được/,
    ],
  ])('turns %s into BAD_REQUEST', async (_case, arrange, message) => {
    arrange();

    await expect(service.verify('SPC_SC_SESSION=x')).rejects.toThrow(message);
  });

  it('logs a masked reason with the network code and never the cookie', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const cause = Object.assign(new Error('bad header cookie: SPC_SC_SESSION=hunter2'), {
      cause: { code: 'ECONNRESET' },
    });
    account.mockRejectedValue(new SellerCenterUnavailableError('down', { cause }));

    await expect(service.verify('SPC_SC_SESSION=hunter2')).rejects.toThrow(DomainException);

    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain('ECONNRESET');
    expect(logged).not.toContain('hunter2');
    warn.mockRestore();
  });

  it('fills user_id, shop_id and a default name from the account', () => {
    const shop: Record<string, unknown> = { platform: 'shopee', shop_id: 5 };

    service.applyAccount(shop, ACCOUNT);

    expect(shop).toEqual({ platform: 'shopee', user_id: 11, shop_id: 22, name: 'seller' });
  });

  it('keeps a typed name and falls back to the user_id when the account has no username', () => {
    const named: Record<string, unknown> = { name: 'mine' };
    const unnamed: Record<string, unknown> = {};

    service.applyAccount(named, ACCOUNT);
    service.applyAccount(unnamed, { user_id: 11, shop_id: null, username: '' });

    expect(named.name).toBe('mine');
    expect(unnamed).toEqual({ user_id: 11, name: '11' });
  });

  it('rejects a typed user_id of another account', () => {
    expect(() => service.applyAccount({ user_id: 99 }, ACCOUNT)).toThrow(/không khớp user_id 99/);
  });

  describe('without a new cookie', () => {
    const stored = { platform: 'shopee', name: 'old', user_id: '11' };

    it('keeps the stored account and defaults a cleared name to the user_id', () => {
      const shop: Record<string, unknown> = { platform: 'shopee' };

      service.keepStoredAccount(shop, stored, { '11': 'SPC_SC_SESSION=x' });

      expect(shop).toEqual({ platform: 'shopee', user_id: 11, name: '11' });
    });

    it('needs a stored cookie', () => {
      expect(() => service.keepStoredAccount({}, stored, {})).toThrow(/Thiếu cookie/);
    });

    it('refuses to change the user_id', () => {
      expect(() =>
        service.keepStoredAccount({ user_id: 12 }, stored, { '11': 'SPC_SC_SESSION=x' }),
      ).toThrow(/Đổi user_id/);
    });
  });
});
