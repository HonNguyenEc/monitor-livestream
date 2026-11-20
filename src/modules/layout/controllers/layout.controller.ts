import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { LayoutSnapshotDto } from '../dtos/layout-snapshot.dto';
import { UpdateLayoutDto } from '../dtos/update-layout.dto';
import { LayoutService } from '../services/layout.service';

@ApiTags('settings')
@Controller('settings/layout')
export class LayoutController {
  constructor(private readonly layoutService: LayoutService) {}

  @Get()
  snapshot(): LayoutSnapshotDto {
    return this.layoutService.snapshot();
  }

  @Put()
  update(@Body() body: UpdateLayoutDto): LayoutSnapshotDto {
    return this.layoutService.update(body);
  }
}
