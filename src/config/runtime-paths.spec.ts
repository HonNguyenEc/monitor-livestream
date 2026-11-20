import { join } from 'node:path';
import { isSea } from 'node:sea';

import { PROJECT_ROOT, resolveDataDir } from './runtime-paths';

jest.mock('node:sea', () => ({ isSea: jest.fn() }));

describe('resolveDataDir', () => {
  const isSeaMock = jest.mocked(isSea);
  const originalLocalAppData = process.env.LOCALAPPDATA;

  afterEach(() => {
    process.env.LOCALAPPDATA = originalLocalAppData;
  });

  it('uses the repo root when running from source', () => {
    isSeaMock.mockReturnValue(false);

    expect(resolveDataDir()).toBe(PROJECT_ROOT);
  });

  it('uses the per-user data folder when packaged', () => {
    isSeaMock.mockReturnValue(true);
    process.env.LOCALAPPDATA = join('C:', 'Users', 'op', 'AppData', 'Local');

    expect(resolveDataDir()).toBe(join(process.env.LOCALAPPDATA, 'LiveQC', 'data'));
  });
});
