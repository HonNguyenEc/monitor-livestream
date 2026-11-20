import { Injectable } from '@nestjs/common';

import { AsyncLock } from '../../../common/concurrency/async-lock';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { MonitorStateDto } from '../dtos/monitor-state.dto';
import { StartMonitorDto } from '../dtos/start-monitor.dto';
import { toMonitorState, toSelection } from '../utils/monitor-state';
import { MonitorSupervisor } from './monitor-supervisor';

@Injectable()
export class MonitorService {
  /** A start and a stop never interleave, so a stop always ends what the start before it began. */
  private readonly lock = new AsyncLock();

  constructor(private readonly supervisor: MonitorSupervisor) {}

  current(): MonitorStateDto {
    return toMonitorState(this.supervisor.current);
  }

  start(body: StartMonitorDto): Promise<MonitorStateDto> {
    return this.lock.run(() => {
      if (body.platforms.length === 0) {
        throw new DomainException(ErrorCode.NO_PLATFORM_SELECTED, ErrorMessage.noPlatformSelected);
      }
      this.supervisor.begin(toSelection(body));
      return Promise.resolve(this.current());
    });
  }

  stop(): Promise<MonitorStateDto> {
    return this.lock.run(async () => {
      await this.supervisor.end();
      return this.current();
    });
  }
}
