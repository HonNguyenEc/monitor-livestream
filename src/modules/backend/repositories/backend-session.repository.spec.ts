import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { EOL, tmpdir } from 'node:os';
import { join } from 'node:path';

import { SESSION_FILE } from '../constants/backend.constants';
import { BackendSession } from '../models/backend-session.model';
import { BackendSessionRepository } from './backend-session.repository';

const SESSION: BackendSession = {
  base_url: 'http://backend.test',
  access_token: 'a1',
  refresh_token: 'r1',
  user: { id: 7, email: 'admin@example.com', name: 'Admin', role: 'admin' },
};

describe('BackendSessionRepository', () => {
  let dir: string;
  let repository: BackendSessionRepository;

  const write = (value: unknown): Promise<void> =>
    writeFile(join(dir, SESSION_FILE), JSON.stringify(value));

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'live-qc-session-'));
    repository = new BackendSessionRepository(dir);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes the Python layout and reads it back', async () => {
    await repository.store(SESSION);

    const text = await readFile(join(dir, SESSION_FILE), 'utf8');
    expect(text).toBe(`${JSON.stringify(SESSION, null, 2)}\n`.replace(/\n/g, EOL));
    await expect(repository.load()).resolves.toEqual(SESSION);
  });

  it('keeps only the known user fields and defaults the missing ones', async () => {
    await write({ ...SESSION, user: { id: '7', email: 'a@b.c', shop_name: 'x' } });

    await expect(repository.load()).resolves.toEqual({
      ...SESSION,
      user: { id: null, email: 'a@b.c', name: '', role: '' },
    });
  });

  it.each([
    ['a list', [SESSION]],
    ['a missing base_url', { ...SESSION, base_url: '' }],
    ['a missing access token', { ...SESSION, access_token: undefined }],
  ])('reads %s as no session', async (_case, value) => {
    await write(value);
    await expect(repository.load()).resolves.toBeNull();
  });

  it('reads a missing file as no session and clears it without failing', async () => {
    await expect(repository.load()).resolves.toBeNull();
    await expect(repository.store(null)).resolves.toBeUndefined();
  });
});
