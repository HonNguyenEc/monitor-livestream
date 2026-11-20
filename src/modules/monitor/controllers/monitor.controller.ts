import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { MonitorStateDto } from '../dtos/monitor-state.dto';
import { StartMonitorDto } from '../dtos/start-monitor.dto';
import { MonitorService } from '../services/monitor.service';

@ApiTags('monitor')
@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Get()
  current(): MonitorStateDto {
    return this.monitorService.current();
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiDomainErrors(ErrorCode.NO_PLATFORM_SELECTED)
  start(@Body() body: StartMonitorDto): MonitorStateDto {
    return this.monitorService.start(body);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  stop(): MonitorStateDto {
    return this.monitorService.stop();
  }
}
