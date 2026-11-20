import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

import { Platform } from '../../../common/enums/platform.enum';

export class StartMonitorDto {
  @IsArray()
  @IsEnum(Platform, { each: true })
  platforms: Platform[];

  /** Limit monitoring to these shops. Every start replaces the monitored set; omitting keys, or `null` as the Python tool allows, means every shop of `platforms`, while `[]` monitors none. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keys?: string[] | null;
}
