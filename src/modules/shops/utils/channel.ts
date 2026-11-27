import { BackendSyncStore } from '../../backend';
import { BRAND_ID_FIELD, ShopField } from '../constants/shop-fields.constants';
import { Channel } from '../models/channel.model';
import { ShopsDocument } from '../models/shop-record.model';
import { StoredShop } from '../models/stored-shop.model';
import { backendShops } from './backend-shops';
import { optionalInteger, optionalString } from './record-values';
import { shopLabel } from './shop-identity';
import { storedShops } from './stored-shops';

/** Every channel by key: the entries of shops.json in file order, then the synced backend ones. */
export function allShops(document: ShopsDocument, backendStore: BackendSyncStore): StoredShop[] {
  return [...storedShops(document), ...backendShops(backendStore)];
}

export function toChannel({ key, platform, source, record }: StoredShop): Channel {
  return {
    key,
    platform,
    source,
    label: shopLabel(record),
    username: optionalString(record[ShopField.USERNAME]),
    userId: optionalInteger(record[ShopField.USER_ID]),
    liveUrl: optionalString(record[ShopField.LIVE_URL]),
    brandId: optionalString(record[BRAND_ID_FIELD]),
  };
}
