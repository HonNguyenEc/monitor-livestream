import { Injectable } from '@nestjs/common';

import { BackendLoginDto } from '../dtos/backend-login.dto';
import { BackendStatusDto } from '../dtos/backend-status.dto';

const SAMPLE_BACKEND_HOST = 'http://loc•••';

const DISCONNECTED: BackendStatusDto = {
  connected: false,
  backend: SAMPLE_BACKEND_HOST,
  email: '',
  name: '',
  role: '',
  synced_at: null,
  error: null,
  brands: 0,
  schedules: 0,
  api_calls_5m: 0,
};

const SAMPLE_CONNECTED: BackendStatusDto = {
  connected: true,
  backend: SAMPLE_BACKEND_HOST,
  email: 'ad•••@example.com',
  name: 'Sample Admin',
  role: 'admin',
  synced_at: '2026-01-01T08:00:00+00:00',
  error: null,
  brands: 1,
  schedules: 1,
  api_calls_5m: 2,
};

@Injectable()
export class BackendConnectionService {
  private current: BackendStatusDto = DISCONNECTED;

  status(): BackendStatusDto {
    return this.current;
  }

  login(_body: BackendLoginDto): BackendStatusDto {
    this.current = SAMPLE_CONNECTED;
    return this.current;
  }

  logout(): BackendStatusDto {
    this.current = DISCONNECTED;
    return this.current;
  }

  sync(): BackendStatusDto {
    return this.current;
  }
}
