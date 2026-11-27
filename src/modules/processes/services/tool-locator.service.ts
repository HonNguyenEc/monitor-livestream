import { Inject, Injectable } from '@nestjs/common';

import { ExternalTool } from '../../../common/process/external-tool';
import { findTool } from '../../../common/process/find-tool';
import { DATA_DIR } from '../../../config/data-dir.module';

/** Where yt-dlp and FFmpeg are: the data folder's tools directory, then PATH. Looked up on every use, so a tool installed while the service runs is found. */
@Injectable()
export class ToolLocator {
  constructor(@Inject(DATA_DIR) private readonly dataDir: string) {}

  find(tool: ExternalTool): Promise<string | null> {
    return findTool(tool, this.dataDir);
  }
}
