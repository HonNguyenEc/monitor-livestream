import { Controller, Get, HttpCode, HttpStatus, Param, Post, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';

import { FRAME_ROUTE, SHOPS_ROUTE } from '../../../common/constants/app.constants';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { DetectionStateDto } from '../dtos/detection-state.dto';
import { DetectionService } from '../services/detection.service';
import { FRAME_CONTENT_TYPE } from '../constants/detection.constants';

@ApiTags('detection')
@Controller(`${SHOPS_ROUTE}/:key`)
export class DetectionController {
  constructor(private readonly detectionService: DetectionService) {}

  @Post('detection/start')
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND, ErrorCode.SHOPS_FILE_UNREADABLE)
  @HttpCode(HttpStatus.OK)
  start(@Param('key') key: string): Promise<DetectionStateDto> {
    return this.detectionService.start(key);
  }

  @Post('detection/stop')
  @HttpCode(HttpStatus.OK)
  stop(@Param('key') key: string): Promise<DetectionStateDto> {
    return this.detectionService.stop(key);
  }

  @Get(FRAME_ROUTE)
  @ApiProduces(FRAME_CONTENT_TYPE)
  @ApiOkResponse({ description: 'Latest frame', schema: { type: 'string', format: 'binary' } })
  @ApiDomainErrors(
    ErrorCode.SHOP_NOT_FOUND,
    ErrorCode.FRAME_NOT_FOUND,
    ErrorCode.SHOPS_FILE_UNREADABLE,
  )
  async frame(@Param('key') key: string): Promise<StreamableFile> {
    return new StreamableFile(await this.detectionService.frame(key), { type: FRAME_CONTENT_TYPE });
  }
}
