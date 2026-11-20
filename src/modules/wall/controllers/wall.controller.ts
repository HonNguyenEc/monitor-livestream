import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { WallRefreshResponseDto } from '../dtos/wall-refresh-response.dto';
import { WallResponseDto } from '../dtos/wall-response.dto';
import { WallService } from '../services/wall.service';

@ApiTags('wall')
@Controller('wall')
export class WallController {
  constructor(private readonly wallService: WallService) {}

  @Get()
  wall(): WallResponseDto {
    return this.wallService.wall();
  }

  @Post(':key/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND, ErrorCode.STREAM_UNAVAILABLE)
  refresh(@Param('key') key: string): WallRefreshResponseDto {
    return this.wallService.refresh(key);
  }
}
