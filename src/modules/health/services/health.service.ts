import { Inject, Injectable } from '@nestjs/common';

import { AppConfig, appConfig } from '../../../config/app.config';
import { HealthResponseDto } from '../dtos/health-response.dto';

const HEALTH_STATUS_OK = 'ok';

@Injectable()
export class HealthService {
  constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {}

  check(): HealthResponseDto {
    return { status: HEALTH_STATUS_OK, version: this.config.version };
  }
}
