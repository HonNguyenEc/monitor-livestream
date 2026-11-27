import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ExternalTool, toolFileName } from '../../../common/process/external-tool';
import { TOOLS_FOLDER } from '../../../common/process/process.constants';
import { ToolLocator } from './tool-locator.service';
import { createDataDir, removeDataDir } from '../../../../test/helpers/data-dir';

describe('ToolLocator', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createDataDir({});
  });
  afterEach(() => removeDataDir(dataDir));

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
