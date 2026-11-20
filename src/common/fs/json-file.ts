import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { EOL } from 'node:os';
import { dirname } from 'node:path';

import {
  FILE_NOT_FOUND,
  LINE_FEEDS,
  TEMP_FILE_SUFFIX,
  UTF8_BOM,
} from '../constants/file.constants';

/** Parsed JSON, or undefined when the file does not exist. Files saved by Notepad may start with a BOM. */
export async function readJsonFile(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === FILE_NOT_FOUND) {
      return undefined;
    }
    throw error;
  }
  return JSON.parse(text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text);
}

// Same bytes as Python's write_text(json.dumps(...) + '\n'), which writes CRLF on Windows. A unique temp
// name keeps two writers (this service and the Python tool) off each other's temp file.
export async function writeJsonFileAtomic(
  path: string,
  value: unknown,
  indent: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}${TEMP_FILE_SUFFIX}`;
  const text = `${JSON.stringify(value, null, indent)}\n`.replace(LINE_FEEDS, EOL);
  await writeFile(temp, text, 'utf8');
  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
