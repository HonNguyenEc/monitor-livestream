import { isAllowedShopeeUrl } from './shopee-url-policy';

describe('isAllowedShopeeUrl', () => {
  it.each([
    'https://live.shopee.vn/share?session=1',
    'https://shopee.vn/x',
    'https://a.b.shopee.vn/',
    'https://LIVE.SHOPEE.VN/',
    'https://shp.ee/abc',
    'https://a.shp.ee/abc',
  ])('accepts %s', (url) => {
    expect(isAllowedShopeeUrl(new URL(url))).toBe(true);
  });

  it.each([
    'http://live.shopee.vn/share',
    'https://evil.com/',
    'https://shopee.vn.evil.com/',
    'https://evilshopee.vn/',
    'https://evil.com/?u=live.shopee.vn',
    'https://live.shopee.vn@evil.com/',
    'ftp://shopee.vn/',
    'http://shp.ee/abc',
    'https://shp.ee.evil.com/abc',
    'https://evilshp.ee/abc',
  ])('rejects %s', (url) => {
    expect(isAllowedShopeeUrl(new URL(url))).toBe(false);
  });
});
