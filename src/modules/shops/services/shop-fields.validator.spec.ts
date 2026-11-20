import { Platform } from '../../../common/enums/platform.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ShopFieldsValidator } from './shop-fields.validator';

describe('ShopFieldsValidator (validate_shop of the Python tool)', () => {
  const validator = new ShopFieldsValidator();

  it('trims, strips leading @ and keeps the Python field order', () => {
    const shop = validator.clean(Platform.TIKTOK, {
      live_url: ' https://x.test ',
      username: ' @@shop ',
    });

    expect(Object.entries(shop)).toEqual([
      ['platform', 'tiktok'],
      ['username', 'shop'],
      ['live_url', 'https://x.test'],
    ]);
  });

  it('turns digit strings into numbers and drops blank optional fields', () => {
    expect(
      validator.clean(Platform.SHOPEE, { name: '', user_id: '123', shop_id: 45, live_url: null }),
    ).toEqual({ platform: 'shopee', user_id: 123, shop_id: 45 });
  });

  it.each([
    ['a missing TikTok username', Platform.TIKTOK, {}],
    ['a username that is only @', Platform.TIKTOK, { username: '@' }],
    ['a non-numeric user_id', Platform.SHOPEE, { user_id: '12a' }],
    ['a negative shop_id', Platform.SHOPEE, { shop_id: -1 }],
    ['an unsafe integer', Platform.SHOPEE, { user_id: '99999999999999999999' }],
    ['a live_url without http(s)', Platform.TIKTOK, { username: 'x', live_url: 'ftp://x' }],
  ])('rejects %s', (_case, platform, input) => {
    expect(() => validator.clean(platform, input)).toThrow(DomainException);
  });

  it('rejects fields the platform does not store, and accepts null for them', () => {
    expect(() =>
      validator.rejectForeignFields(Platform.TIKTOK, { username: 'x', shop_id: 1 }),
    ).toThrow(DomainException);
    expect(() =>
      validator.rejectForeignFields(Platform.TIKTOK, { username: 'x', shop_id: null }),
    ).not.toThrow();
    expect(() =>
      validator.rejectForeignFields(Platform.SHOPEE, { platform: 'shopee', cookie: 'c' }),
    ).not.toThrow();
  });
});
