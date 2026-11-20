import { mkdir, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

import { ExternalTool, toolFileName } from './external-tool';
import { findTool } from './find-tool';
import { createDataDir, removeDataDir } from '../../../test/helpers/data-dir';

describe('findTool', () => {
  let root: string;
  const file = toolFileName(ExternalTool.FFMPEG);

  beforeEach(async () => {
    root = await createDataDir({});
  });
  afterEach(() => removeDataDir(root));

  async function place(...folders: string[]): Promise<string> {
    const dir = join(root, ...folders);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, file), '');
    return join(dir, file);
  }

  it('prefers the tools folder of the data directory over PATH', async () => {
    const bundled = await place('data', 'tools');
    await place('bin');

    expect(await findTool(ExternalTool.FFMPEG, join(root, 'data'), join(root, 'bin'))).toBe(
      bundled,
    );
  });

  it('falls back to the first PATH folder that has it, skipping empty and quoted entries', async () => {
    const onPath = await place('bin');

    const found = await findTool(
      ExternalTool.FFMPEG,
      join(root, 'data'),
      ['', join(root, 'nope'), `"${join(root, 'bin')}"`].join(delimiter),
    );

    expect(found).toBe(onPath);
  });

  it('is null when neither place has it, or when the name is a folder', async () => {
    await mkdir(join(root, 'bin', file), { recursive: true });

    expect(await findTool(ExternalTool.FFMPEG, join(root, 'data'), join(root, 'bin'))).toBeNull();
  });
});
