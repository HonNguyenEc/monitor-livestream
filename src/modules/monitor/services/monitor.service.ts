import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { MonitorStateDto } from '../dtos/monitor-state.dto';
import { StartMonitorDto } from '../dtos/start-monitor.dto';

const STOPPED: MonitorStateDto = { running: false, platforms: [], keys: null };

@Injectable()
export class MonitorService {
  private state: MonitorStateDto = STOPPED;

  current(): MonitorStateDto {
    return this.state;
  }

  start(body: StartMonitorDto): MonitorStateDto {
    if (body.platforms.length === 0) {
      throw new DomainException(ErrorCode.NO_PLATFORM_SELECTED, ErrorMessage.noPlatformSelected);
    }
    this.state = {
      running: true,
      platforms: [...body.platforms],
      keys: body.keys ? [...body.keys] : null,
    };
    return this.state;
  }

  stop(): MonitorStateDto {
    this.state = STOPPED;
    return this.state;
  }
}
