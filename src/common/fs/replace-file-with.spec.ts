import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';

import { replaceFileWith } from './replace-file-with';

/** Errors the next call of each function rejects with; every other call is real. */
const mockFailures: { rename: Error[]; rm: Error[] } = { rename: [], rm: [] };
jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    rename: (...args: Parameters<typeof actual.rename>) => {
      const failure = mockFailures.rename.shift();
      return failure ? Promise.reject(failure) : actual.rename(...args);
    },
    rm: (...args: Parameters<typeof actual.rm>) => {
      const failure = mockFailures.rm.shift();
      return failure ? Promise.reject(failure) : actual.rm(...args);
    },
  };
});

describe('replaceFileWith', () => {
  let dir: string;
  let destination: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'live-qc-replace-'));
    destination = join(dir, 'sub', 'latest.jpg');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('creates the folder and moves the finished file into place, leaving no temp file', async () => {
    const done = await replaceFileWith(destination, async (temp) => {
      await writeFile(temp, 'NEW');
      return true;
    });

    expect(done).toBe(true);
    expect(await readFile(destination, 'utf8')).toBe('NEW');
    expect(await readdir(join(dir, 'sub'))).toEqual(['latest.jpg']);
  });

  it('keeps the old file when nothing was made, or the file is empty', async () => {
    await replaceFileWith(destination, async (temp) => (await writeFile(temp, 'OLD'), true));

    expect(await replaceFileWith(destination, () => Promise.resolve(false))).toBe(false);
    expect(
      await replaceFileWith(destination, async (temp) => (await writeFile(temp, ''), true)),
    ).toBe(false);

    expect(await readFile(destination, 'utf8')).toBe('OLD');
    expect(await readdir(join(dir, 'sub'))).toEqual(['latest.jpg']);
  });

  it('removes its temp file when producing throws', async () => {
    await expect(
      replaceFileWith(destination, async (temp) => {
        await writeFile(temp, 'half');
        throw new Error('disk full');
      }),
    ).rejects.toThrow('disk full');

    expect(await readdir(join(dir, 'sub'))).toEqual([]);
  });

  it('rejects when the move fails', async () => {
    mockFailures.rename.push(Object.assign(new Error('cross device'), { code: 'EXDEV' }));

    await expect(
      replaceFileWith(destination, async (temp) => (await writeFile(temp, 'NEW'), true)),
    ).rejects.toThrow('cross device');
  });

  it('logs a temp file it cannot remove, without changing the result', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    mockFailures.rm.push(Object.assign(new Error('locked'), { code: 'EBUSY' }));

    const done = await replaceFileWith(destination, () => Promise.resolve(false));

    expect(done).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cannot remove'));
    warn.mockRestore();
  });

  it('gives the temp file the extension of the destination, which tools pick the format from', async () => {
    let tempName = '';

    await replaceFileWith(join(dir, 'latest.png'), async (temp) => {
      tempName = temp;
      await writeFile(temp, 'x');
      return true;
    });

    expect(tempName).toMatch(/\.tmp\.png$/);
  });
});
