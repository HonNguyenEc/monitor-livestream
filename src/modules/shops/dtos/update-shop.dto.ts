import { OmitType } from '@nestjs/swagger';

import { CreateShopDto } from './create-shop.dto';

export class UpdateShopDto extends OmitType(CreateShopDto, ['platform'] as const) {}
