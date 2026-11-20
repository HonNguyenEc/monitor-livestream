import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';

import { URL_PROTOCOLS } from '../../../common/constants/validation.constants';
import { isPresent } from '../../../common/validation/is-present';

// IsOptional also skips null, which is how the optional fields below get cleared.
export class UpdateShopDto {
  /** TikTok shops only. Cannot be cleared. */
  @ValidateIf(isPresent)
  @IsString()
  @IsNotEmpty()
  username?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  user_id?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  shop_id?: number | null;

  /** TikTok: an http(s) URL. Shopee: an https URL on shopee.vn or shp.ee. */
  @IsOptional()
  @IsUrl({ protocols: URL_PROTOCOLS, require_protocol: true })
  live_url?: string | null;

  /** Raw `cookie` header of a banhang.shopee.vn request, Shopee shops only. Omit it to keep the stored cookie. */
  @ValidateIf(isPresent)
  @IsString()
  @IsNotEmpty()
  cookie?: string;
}
