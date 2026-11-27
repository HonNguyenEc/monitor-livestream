import { OmitType } from '@nestjs/swagger';

import { CreateShopDto } from './create-shop.dto';

/** Editable fields of a local shop; backend shops expose only `name`. */
export class ShopConfigDto extends OmitType(CreateShopDto, ['cookie'] as const) {}
