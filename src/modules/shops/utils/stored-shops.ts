import { ShopSource } from '../../../common/enums/shop-source.enum';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { ShopsDocument } from '../models/shop-record.model';
import { StoredShop } from '../models/stored-shop.model';
import { isBackendShop, shopKey, shopPlatform } from './shop-identity';

/** The monitorable entries of shops.json; other entries stay in the file but are not listed. */
export function storedShops(document: ShopsDocument): StoredShop[] {
  const shops: StoredShop[] = [];
  document.shops.forEach((record, index) => {
    const platform = isPlainObject(record) ? shopPlatform(record) : null;
    if (!isPlainObject(record) || platform === null) {
      return;
    }
    const source = isBackendShop(record) ? ShopSource.BACKEND : ShopSource.LOCAL;
    shops.push({ key: shopKey(platform, record), platform, source, record, index });
  });
  return shops;
}

/** The first match, as the Python tool picks when two entries share a key. */
export function findStoredShop(shops: StoredShop[], key: string): StoredShop | undefined {
  return shops.find((shop) => shop.key === key);
}
