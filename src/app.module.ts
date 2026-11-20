import { join } from 'node:path';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { ENV_FILE } from './common/constants/app.constants';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { appConfig } from './config/app.config';
import { DataDirModule } from './config/data-dir.module';
import { resolveDataDir } from './config/runtime-paths';
import { BackendModule } from './modules/backend/backend.module';
import { DetectionModule } from './modules/detection/detection.module';
import { HealthModule } from './modules/health/health.module';
import { LayoutModule } from './modules/layout/layout.module';
import { MonitorModule } from './modules/monitor/monitor.module';
import { ShopsModule } from './modules/shops/shops.module';
import { WallModule } from './modules/wall/wall.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: join(resolveDataDir(), ENV_FILE),
    }),
    DataDirModule,
    HealthModule,
    ShopsModule,
    DetectionModule,
    MonitorModule,
    BackendModule,
    LayoutModule,
    WallModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
