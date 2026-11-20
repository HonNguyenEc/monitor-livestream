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

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { CreateShopDto } from '../dtos/create-shop.dto';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopListResponseDto } from '../dtos/shop-list-response.dto';
import { UpdateShopDto } from '../dtos/update-shop.dto';
import { ShopsService } from '../services/shops.service';

@ApiTags('shops')
@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  list(): ShopListResponseDto {
    return this.shopsService.list();
  }

  @Get(':key')
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND)
  get(@Param('key') key: string): ShopDetailDto {
    return this.shopsService.get(key);
  }

  @Post()
  @ApiDomainErrors(ErrorCode.SHOP_ALREADY_EXISTS)
  create(@Body() body: CreateShopDto): ShopDetailDto {
    return this.shopsService.create(body);
  }

  @Put(':key')
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND, ErrorCode.BACKEND_SHOP_READ_ONLY)
  update(@Param('key') key: string, @Body() body: UpdateShopDto): ShopDetailDto {
    return this.shopsService.update(key, body);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND, ErrorCode.BACKEND_SHOP_READ_ONLY)
  remove(@Param('key') key: string): void {
    this.shopsService.remove(key);
  }
}
