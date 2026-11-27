import { Platform } from '../../../common/enums/platform.enum';
import { MANAGED_FIELDS, PLATFORM_FIELDS } from '../constants/shop-fields.constants';
import { CreateShopDto } from '../dtos/create-shop.dto';
import { UpdateShopDto } from '../dtos/update-shop.dto';
import { ShopInput } from '../models/shop-input.model';
import { ShopRecord } from '../models/shop-record.model';

export function inputFromCreate(body: CreateShopDto): ShopInput {
  return Object.fromEntries(PLATFORM_FIELDS[body.platform].map((field) => [field, body[field]]));
}

/** The stored fields with the update applied: an omitted field stays, null clears it. */
export function inputFromUpdate(
  platform: Platform,
  stored: ShopRecord,
  body: UpdateShopDto,
): ShopInput {
  return Object.fromEntries(
    PLATFORM_FIELDS[platform].map((field) => [
      field,
      body[field] === undefined ? stored[field] : body[field],
    ]),
  );
}

/** The cleaned fields plus every field of the stored entry this service does not manage. */
export function withUnknownFields(clean: ShopRecord, stored: ShopRecord): ShopRecord {
  const unknown = Object.entries(stored).filter(([field]) => !MANAGED_FIELDS.includes(field));
  return { ...clean, ...Object.fromEntries(unknown) };
}
