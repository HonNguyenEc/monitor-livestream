import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { EOL, tmpdir } from 'node:os';
import { join } from 'node:path';

import { readJsonFile, writeJsonFileAtomic } from './json-file';

describe('json-file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'json-file-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('can leave out the newline Python does not write', async () => {
    const path = join(dir, 'no-newline.json');

    await writeJsonFileAtomic(path, { a: 1 }, 2, false);

    expect((await readFile(path, 'utf8')).endsWith('}')).toBe(true);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ a: 1 });
  });

  it('reads undefined for a missing file', async () => {
    expect(await readJsonFile(join(dir, 'missing.json'))).toBeUndefined();
  });

  it('reads a file that starts with a UTF-8 BOM', async () => {
    await writeFile(join(dir, 'a.json'), '\uFEFF{"a": 1}', 'utf8');

    expect(await readJsonFile(join(dir, 'a.json'))).toEqual({ a: 1 });
  });

  it('throws on invalid JSON instead of returning a guess', async () => {
    await writeFile(join(dir, 'a.json'), '{', 'utf8');

    await expect(readJsonFile(join(dir, 'a.json'))).rejects.toThrow(SyntaxError);
  });

  it('writes indented UTF-8 with OS line endings, creating the folder, and leaves no temp file', async () => {
    const path = join(dir, 'nested', 'a.json');

    await writeJsonFileAtomic(path, { name: 'Cửa hàng', ids: [1] }, 4);

    expect(await readFile(path, 'utf8')).toBe(
      ['{', '    "name": "Cửa hàng",', '    "ids": [', '        1', '    ]', '}', ''].join(EOL),
    );
    expect(await readdir(join(dir, 'nested'))).toEqual(['a.json']);
  });

  it('replaces an existing file', async () => {
    const path = join(dir, 'a.json');
    await writeFile(path, '{"old": true}', 'utf8');

    await writeJsonFileAtomic(path, { new: true }, 2);

    expect(await readJsonFile(path)).toEqual({ new: true });
  });

  it('leaves no temp file behind when the target cannot be replaced', async () => {
    const path = join(dir, 'a.json');
    await mkdir(path);

    await expect(writeJsonFileAtomic(path, { a: 1 }, 2)).rejects.toThrow();

    expect(await readdir(dir)).toEqual(['a.json']);
  });
});
