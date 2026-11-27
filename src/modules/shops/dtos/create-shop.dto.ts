import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';

import { URL_PROTOCOLS } from '../../../common/constants/validation.constants';
import { Platform } from '../../../common/enums/platform.enum';

export class CreateShopDto {
  @IsEnum(Platform)
  platform: Platform;

  /** Required for TikTok shops. */
  @ValidateIf(
    (shop: CreateShopDto) => shop.platform === Platform.TIKTOK || shop.username !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  username?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  user_id?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  shop_id?: number;

  /** TikTok: an http(s) URL. Shopee: an https URL on shopee.vn or shp.ee. */
  @IsOptional()
  @IsUrl({ protocols: URL_PROTOCOLS, require_protocol: true })
  live_url?: string;

  /** Raw `cookie` header of a banhang.shopee.vn request, required for Shopee shops. */
  @ValidateIf(
    (shop: CreateShopDto) => shop.platform === Platform.SHOPEE || shop.cookie !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  cookie?: string;
}
