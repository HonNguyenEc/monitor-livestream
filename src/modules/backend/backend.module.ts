import { Module } from '@nestjs/common';

import { BackendController } from './controllers/backend.controller';
import { BackendConnectionService } from './services/backend-connection.service';

@Module({
  controllers: [BackendController],
  providers: [BackendConnectionService],
})
export class BackendModule {}
