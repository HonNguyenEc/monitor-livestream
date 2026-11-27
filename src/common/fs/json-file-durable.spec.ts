import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonFileAtomic } from './json-file';
import { createDataDir, removeDataDir } from '../../../test/helpers/data-dir';

const order: string[] = [];

jest.mock('node:fs/promises', () => {
  const actual = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        order.push('sync');
        await sync();
      };
      return handle;
    },
    rename: async (...args: Parameters<typeof actual.rename>) => {
      order.push('rename');
      await actual.rename(...args);
    },
  };
});

describe('writeJsonFileAtomic durability', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createDataDir({});
    order.length = 0;
  });

  afterEach(() => removeDataDir(dir));

  it('flushes the temp file to disk before it takes the final name', async () => {
    await writeJsonFileAtomic(join(dir, 'a.json'), { a: 1 }, 2);

    expect(order).toEqual(['sync', 'rename']);
    expect(JSON.parse(await readFile(join(dir, 'a.json'), 'utf8'))).toEqual({ a: 1 });
  });
});
