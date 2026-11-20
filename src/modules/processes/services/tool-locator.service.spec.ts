import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExternalTool, toolFileName } from '../../../common/process/external-tool';
import { TOOLS_FOLDER } from '../../../common/process/process.constants';
import { ToolLocator } from './tool-locator.service';

describe('ToolLocator', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'live-qc-locator-'));
  });
  afterEach(() => rm(dataDir, { recursive: true, force: true }));

  it('finds a tool dropped into the tools folder after the service started', async () => {
    const locator = new ToolLocator(dataDir);
    const file = join(dataDir, TOOLS_FOLDER, toolFileName(ExternalTool.YTDLP));
    const before = await locator.find(ExternalTool.YTDLP);
    await mkdir(join(dataDir, TOOLS_FOLDER));
    await writeFile(file, '');

    expect(await locator.find(ExternalTool.YTDLP)).toBe(file);
    expect(before).not.toBe(file);
  });
});
