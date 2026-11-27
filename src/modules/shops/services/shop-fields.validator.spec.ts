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

  it.each(['https://live.shopee.vn/share?session=1', 'https://shp.ee/abc', 'HTTPS://shp.ee/abc'])(
    'accepts the Shopee live_url %s',
    (liveUrl) => {
      expect(validator.clean(Platform.SHOPEE, { live_url: liveUrl })).toMatchObject({
        live_url: liveUrl,
      });
    },
  );

  it.each([
    'http://live.shopee.vn/share',
    'https://evil.com/live',
    'https://shopee.vn.evil.com/',
    'not a url',
  ])('rejects the Shopee live_url %s', (liveUrl) => {
    expect(() => validator.assertSuppliedLiveUrl(Platform.SHOPEE, liveUrl)).toThrow(
      DomainException,
    );
  });

  it('keeps only the generic http(s) check for a stored Shopee live_url', () => {
    expect(validator.clean(Platform.SHOPEE, { live_url: 'http://x.test/live' })).toMatchObject({
      live_url: 'http://x.test/live',
    });
    expect(() => validator.clean(Platform.SHOPEE, { live_url: 'ftp://x.test' })).toThrow(
      DomainException,
    );
  });

  it('ignores an absent or blank supplied live_url', () => {
    expect(() => validator.assertSuppliedLiveUrl(Platform.SHOPEE, undefined)).not.toThrow();
    expect(() => validator.assertSuppliedLiveUrl(Platform.SHOPEE, null)).not.toThrow();
    expect(() => validator.assertSuppliedLiveUrl(Platform.SHOPEE, '  ')).not.toThrow();
  });

  it('keeps the plain http(s) rule for a TikTok live_url', () => {
    expect(
      validator.clean(Platform.TIKTOK, { username: 'x', live_url: 'http://example.test/live' }),
    ).toMatchObject({ live_url: 'http://example.test/live' });
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
