import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { CreateShopDto } from '../dtos/create-shop.dto';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopListResponseDto } from '../dtos/shop-list-response.dto';
import { UpdateShopDto } from '../dtos/update-shop.dto';
import { SAMPLE_DETAILS, SAMPLE_ROWS, SAMPLE_TIKTOK_DETAIL } from '../fixtures/shop.fixtures';

@Injectable()
export class ShopsService {
  list(): ShopListResponseDto {
    return { items: SAMPLE_ROWS };
  }

  get(key: string): ShopDetailDto {
    const shop = SAMPLE_DETAILS.find((detail) => detail.key === key);
    if (!shop) {
      throw new DomainException(ErrorCode.SHOP_NOT_FOUND, `Shop ${key} not found`);
    }
    return shop;
  }

  create(_body: CreateShopDto): ShopDetailDto {
    return SAMPLE_TIKTOK_DETAIL;
  }

  update(key: string, _body: UpdateShopDto): ShopDetailDto {
    return this.get(key);
  }

  remove(key: string): void {
    this.get(key);
  }
}
