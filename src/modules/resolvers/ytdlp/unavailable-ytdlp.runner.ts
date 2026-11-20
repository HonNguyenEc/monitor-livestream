import { Injectable } from '@nestjs/common';
import { YTDLP_UNAVAILABLE_EXIT_CODE, YTDLP_UNAVAILABLE_MESSAGE } from './ytdlp.constants';
import { YtDlpRunner, YtDlpRunResult } from './ytdlp-runner';

@Injectable()
export class UnavailableYtDlpRunner implements YtDlpRunner {
  run(): Promise<YtDlpRunResult> {
    return Promise.resolve({
      exitCode: YTDLP_UNAVAILABLE_EXIT_CODE,
      stdout: '',
      stderr: YTDLP_UNAVAILABLE_MESSAGE,
      timedOut: false,
    });
  }
}
