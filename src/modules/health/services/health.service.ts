import { Inject, Injectable } from '@nestjs/common';

import { AppConfig, appConfig } from '../../../config/app.config';
import { HealthResponseDto } from '../dtos/health-response.dto';
import { HEALTH_STATUS_OK, PRODUCT_ID } from '../constants/health.constants';

@Injectable()
export class HealthService {
  constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {}

  check(): HealthResponseDto {
    return { product: PRODUCT_ID, status: HEALTH_STATUS_OK, version: this.config.version };
  }
}
