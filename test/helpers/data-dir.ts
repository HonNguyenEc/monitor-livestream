import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { EOL, tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA_DIR_PREFIX = 'live-qc-test-';

/** A path under the OS temp folder that does not exist yet, so reads see a first run. */
export function missingDataDir(): string {
  return join(tmpdir(), `${DATA_DIR_PREFIX}${randomUUID()}`);
}

/** The exact text Python's write_text(json.dumps(value, indent=indent) + '\n') leaves on this OS. */
export function pythonJsonText(value: unknown, indent: number): string {
  return `${JSON.stringify(value, null, indent)}\n`.replace(/\n/g, EOL);
}

/** A temp data folder holding each file as Python writes it (JSON, 4-space indent). */
export async function createDataDir(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), DATA_DIR_PREFIX));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), pythonJsonText(content, 4), 'utf8');
  }
  return dir;
}

export async function readDataFile(dir: string, name: string): Promise<string> {
  return readFile(join(dir, name), 'utf8');
}

export function removeDataDir(dir: string): Promise<void> {
  return rm(dir, { recursive: true, force: true });
}
