import { Platform } from '../../../common/enums/platform.enum';
import { ShopRecord } from '../models/shop-record.model';
import { isBackendShop, sanitizeKeyPart, shopKey, shopLabel, shopPlatform } from './shop-identity';

// Expected values come from livestream_qc.config.shop_key / shop_label run on the same records.
describe('shop identity (parity with the Python tool)', () => {
  const keyOf = (record: ShopRecord): string => shopKey(shopPlatform(record)!, record);

  it.each([
    [{ platform: 'tiktok', username: 'unidry_official' }, 'tiktok_unidry_official'],
    [{ platform: 'TikTok', username: 'bongbachtuyet.official' }, 'tiktok_bongbachtuyet_official'],
    [{ platform: 'shopee', name: 'Cửa hàng ABC', user_id: 1, shop_id: 2 }, 'shopee_C_a_h_ng_ABC'],
    [{ platform: 'shopee', shop_id: 61922582 }, 'shopee_61922582'],
    [{ platform: 'shopee' }, 'shopee_None'],
    [{ platform: 'shopee', name: '', shop_id: 5 }, 'shopee_5'],
    [{ platform: 'tiktok', username: 'a b/c?d😀e' }, 'tiktok_a_b_c_d_e'],
    [{ platform: 'shopee', name: 'Nguyễn' }, 'shopee_Nguye__n'],
  ])('keys %j as %s', (record, key) => {
    expect(keyOf(record)).toBe(key);
  });

  it.each([
    ['6512bd43d9caa6e02c990b0a82652dca', 'shopee_api_a9c71ad9a2'],
    [42, 'shopee_api_92cfceb39d'],
  ])('keys a backend shop by the first 10 hex chars of sha1(brand_id %p)', (brandId, key) => {
    expect(keyOf({ platform: 'shopee', brand_id: brandId, name: 'Brand' })).toBe(key);
  });

  it('treats an empty brand_id as a local shop', () => {
    const record = { platform: 'shopee', brand_id: '', name: 'NoBrand' };

    expect(isBackendShop(record)).toBe(false);
    expect(keyOf(record)).toBe('shopee_NoBrand');
  });

  it.each([
    [{ username: 'u', name: 'n', shop_id: 1 }, 'u'],
    [{ name: 'n', shop_id: 1 }, 'n'],
    [{ username: '', name: '', shop_id: 7 }, '7'],
    [{}, 'None'],
  ])('labels %j as %p', (record, label) => {
    expect(shopLabel(record)).toBe(label);
  });

  it('keeps only letters, digits, underscore and hyphen in a key part', () => {
    expect(sanitizeKeyPart('a-b_C9.@ đ')).toBe('a-b_C9____');
  });

  it.each([
    [{ platform: 'SHOPEE' }, Platform.SHOPEE],
    [{ platform: 'youtube' }, null],
    [{}, null],
    [{ platform: 1 }, null],
  ])('reads the platform of %j as %p', (record, platform) => {
    expect(shopPlatform(record)).toBe(platform);
  });
});
