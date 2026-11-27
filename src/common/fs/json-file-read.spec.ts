import { BUSY_FILE_ATTEMPTS } from '../constants/file.constants';
import { readJsonFile } from './json-file';

const mockReadFile = jest.fn();

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, readFile: (...args: unknown[]) => mockReadFile(...args) };
});

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('readJsonFile busy retry', () => {
  beforeEach(() => mockReadFile.mockReset());

  it('retries while the file is busy, then reads it', async () => {
    mockReadFile.mockRejectedValueOnce(fsError('EBUSY')).mockResolvedValue('{"a":1}');

    await expect(readJsonFile('x.json')).resolves.toEqual({ a: 1 });
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt budget', async () => {
    mockReadFile.mockRejectedValue(fsError('EPERM'));

    await expect(readJsonFile('x.json')).rejects.toThrow('EPERM');
    expect(mockReadFile).toHaveBeenCalledTimes(BUSY_FILE_ATTEMPTS);
  });

  it('reads a missing file as undefined without retrying', async () => {
    mockReadFile.mockRejectedValue(fsError('ENOENT'));

    await expect(readJsonFile('x.json')).resolves.toBeUndefined();
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });
});
