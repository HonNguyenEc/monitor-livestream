import { PartialType } from '@nestjs/swagger';

import { LayoutSettingsDto } from './layout-settings.dto';

export class UpdateLayoutDto extends PartialType(LayoutSettingsDto) {}
