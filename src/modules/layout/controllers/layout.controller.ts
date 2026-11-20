import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ApiDomainErrors } from '../../../common/decorators/api-domain-errors.decorator';
import { RejectNullFieldsPipe } from '../../../common/pipes/reject-null-fields.pipe';
import { LayoutSnapshotDto } from '../dtos/layout-snapshot.dto';
import { UpdateLayoutDto } from '../dtos/update-layout.dto';
import { LayoutService } from '../services/layout.service';

@ApiTags('settings')
@Controller('settings/layout')
export class LayoutController {
  constructor(private readonly layoutService: LayoutService) {}

  @Get()
  @ApiDomainErrors(ErrorCode.SHOPS_FILE_UNREADABLE)
  snapshot(): Promise<LayoutSnapshotDto> {
    return this.layoutService.snapshot();
  }

  @Put()
  @ApiDomainErrors(ErrorCode.SHOPS_FILE_UNREADABLE, ErrorCode.LAYOUT_FILE_UNREADABLE)
  update(@Body(RejectNullFieldsPipe) body: UpdateLayoutDto): Promise<LayoutSnapshotDto> {
    return this.layoutService.update(body);
  }
}
