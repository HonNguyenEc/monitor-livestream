import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

import { Platform } from '../../../common/enums/platform.enum';

export class StartMonitorDto {
  @IsArray()
  @IsEnum(Platform, { each: true })
  platforms: Platform[];

  /** Limit monitoring to these shops. Every start replaces the monitored set; omitting keys means every shop of `platforms`. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keys?: string[];
}
