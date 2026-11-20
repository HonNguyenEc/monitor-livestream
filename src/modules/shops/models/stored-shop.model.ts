import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { ShopRecord } from './shop-record.model';

export interface StoredShop {
  key: string;
  platform: Platform;
  source: ShopSource;
  record: ShopRecord;
  /** Position in the `shops` array of shops.json. */
  index: number;
}
