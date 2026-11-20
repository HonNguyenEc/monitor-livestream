import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { EOL } from 'node:os';
import { dirname } from 'node:path';

import {
  FILE_NOT_FOUND,
  LINE_FEEDS,
  BUSY_FILE_ATTEMPTS,
  BUSY_FILE_CODES,
  BUSY_FILE_RETRY_DELAY_MS,
  TEMP_FILE_SUFFIX,
  UTF8_BOM,
} from '../constants/file.constants';

/** Parsed JSON, or undefined when the file does not exist. Files saved by Notepad may start with a BOM. */
export async function readJsonFile(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await retryWhileBusy(() => readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === FILE_NOT_FOUND) {
      return undefined;
    }
    throw error;
  }
  return JSON.parse(text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text);
}

// Same layout and line endings as Python's write_text(json.dumps(...) + '\n'), which writes CRLF on
// Windows; JSON.stringify normalizes numeric literals (2.0 becomes 2). A unique temp name keeps two
// writers (this service and the Python tool) off each other's temp file.
export async function writeJsonFileAtomic(
  path: string,
  value: unknown,
  indent: number,
  finalNewline = true,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}${TEMP_FILE_SUFFIX}`;
  const body = JSON.stringify(value, null, indent);
  const text = (finalNewline ? `${body}\n` : body).replace(LINE_FEEDS, EOL);
  try {
    await writeDurably(temp, text);
    await retryWhileBusy(() => rename(temp, path));
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

// The rename is only atomic for the name: without the flush a power cut can leave the new name on an empty file.
async function writeDurably(path: string, text: string): Promise<void> {
  const handle = await open(path, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Windows refuses to read or replace a file another process (the Python tool, an editor,
// antivirus) holds for a moment; a short retry rides that out.
async function retryWhileBusy<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (attempt >= BUSY_FILE_ATTEMPTS || !BUSY_FILE_CODES.includes(code)) {
        throw error;
      }
      await sleep(BUSY_FILE_RETRY_DELAY_MS);
    }
  }
}
