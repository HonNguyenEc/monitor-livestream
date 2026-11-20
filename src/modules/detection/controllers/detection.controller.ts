import { Controller, Get, HttpCode, HttpStatus, Param, Post, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { DetectionStateDto } from '../dtos/detection-state.dto';
import { DetectionService } from '../services/detection.service';

const FRAME_CONTENT_TYPE = 'image/jpeg';

@ApiTags('detection')
@Controller('shops/:key')
export class DetectionController {
  constructor(private readonly detectionService: DetectionService) {}

  @Post('detection/start')
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND, ErrorCode.SHOPS_FILE_UNREADABLE)
  @HttpCode(HttpStatus.OK)
  start(@Param('key') key: string): Promise<DetectionStateDto> {
    return this.detectionService.start(key);
  }

  @Post('detection/stop')
  @ApiDomainErrors(ErrorCode.SHOP_NOT_FOUND, ErrorCode.SHOPS_FILE_UNREADABLE)
  @HttpCode(HttpStatus.OK)
  stop(@Param('key') key: string): Promise<DetectionStateDto> {
    return this.detectionService.stop(key);
  }

  @Get('frame')
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
