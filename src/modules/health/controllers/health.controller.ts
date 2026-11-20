import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { HealthResponseDto } from '../dtos/health-response.dto';
import { HealthService } from '../services/health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthResponseDto {
    return this.healthService.check();
  }
}
