import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';

import { SHOPS_ROUTE } from '../../../common/constants/app.constants';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { CreateShopDto } from '../dtos/create-shop.dto';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopListResponseDto } from '../dtos/shop-list-response.dto';
import { UpdateShopDto } from '../dtos/update-shop.dto';
import { ShopsService } from '../services/shops.service';

@ApiTags('shops')
@Controller(SHOPS_ROUTE)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  @ApiDomainErrors(ErrorCode.SHOPS_FILE_UNREADABLE)
  list(): Promise<ShopListResponseDto> {
    return this.shopsService.list();
  }

  @Get(':key')
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND, ErrorCode.SHOPS_FILE_UNREADABLE)
  get(@Param('key') key: string): Promise<ShopDetailDto> {
    return this.shopsService.get(key);
  }

  @Post()
  @ApiDomainErrors(
    ErrorCode.SHOP_ALREADY_EXISTS,
    ErrorCode.SHOPS_FILE_UNREADABLE,
    ErrorCode.COOKIES_FILE_UNREADABLE,
  )
  create(@Body() body: CreateShopDto): Promise<ShopDetailDto> {
    return this.shopsService.create(body);
  }

  @Put(':key')
  @ApiDomainErrors(
    ErrorCode.SHOP_NOT_FOUND,
    ErrorCode.BACKEND_SHOP_READ_ONLY,
    ErrorCode.SHOP_ALREADY_EXISTS,
    ErrorCode.SHOPS_FILE_UNREADABLE,
    ErrorCode.COOKIES_FILE_UNREADABLE,
  )
  update(@Param('key') key: string, @Body() body: UpdateShopDto): Promise<ShopDetailDto> {
    return this.shopsService.update(key, body);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiDomainErrors(
    ErrorCode.SHOP_NOT_FOUND,
    ErrorCode.BACKEND_SHOP_READ_ONLY,
    ErrorCode.SHOPS_FILE_UNREADABLE,
  )
  remove(@Param('key') key: string): Promise<void> {
    return this.shopsService.remove(key);
  }
}
