import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BUSY_FILE_ATTEMPTS } from '../constants/file.constants';
import { writeJsonFileAtomic } from './json-file';

const mockRename = jest.fn();

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, rename: (...args: unknown[]) => mockRename(...args) };
});

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('writeJsonFileAtomic rename retry', () => {
  let dir: string;
  let realRename: typeof import('node:fs/promises').rename;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'json-file-rename-'));
    realRename = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises').rename;
    mockRename.mockReset();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('retries while the target is busy, then writes the file', async () => {
    mockRename
      .mockRejectedValueOnce(fsError('EBUSY'))
      .mockRejectedValueOnce(fsError('EBUSY'))
      .mockImplementation(realRename);

    await writeJsonFileAtomic(join(dir, 'a.json'), { a: 1 }, 2);

    expect(mockRename).toHaveBeenCalledTimes(3);
    expect(JSON.parse(await readFile(join(dir, 'a.json'), 'utf8'))).toEqual({ a: 1 });
    expect(await readdir(dir)).toEqual(['a.json']);
  });

  it('gives up after the attempt budget and removes the temp file', async () => {
    mockRename.mockRejectedValue(fsError('EPERM'));

    await expect(writeJsonFileAtomic(join(dir, 'a.json'), { a: 1 }, 2)).rejects.toThrow('EPERM');

    expect(mockRename).toHaveBeenCalledTimes(BUSY_FILE_ATTEMPTS);
    expect(await readdir(dir)).toEqual([]);
  });

  it('does not retry an error that is not about a busy file', async () => {
    mockRename.mockRejectedValue(fsError('ENOSPC'));

    await expect(writeJsonFileAtomic(join(dir, 'a.json'), { a: 1 }, 2)).rejects.toThrow('ENOSPC');

    expect(mockRename).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toEqual([]);
  });
});
