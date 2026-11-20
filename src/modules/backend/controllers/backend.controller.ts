import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { BackendLoginDto } from '../dtos/backend-login.dto';
import { BackendStatusDto } from '../dtos/backend-status.dto';
import { BackendConnectionService } from '../services/backend-connection.service';

@ApiTags('backend')
@Controller('backend')
export class BackendController {
  constructor(private readonly connection: BackendConnectionService) {}

  @Get('status')
  status(): BackendStatusDto {
    return this.connection.status();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiDomainErrors(ErrorCode.BACKEND_LOGIN_FAILED)
  login(@Body() body: BackendLoginDto): BackendStatusDto {
    return this.connection.login(body);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(): BackendStatusDto {
    return this.connection.logout();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiDomainErrors(ErrorCode.BACKEND_NOT_CONNECTED)
  sync(): BackendStatusDto {
    return this.connection.sync();
  }
}
