import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { Logger } from '@nestjs/common';

import { REPLACE_FILE_LOG_CONTEXT, TEMP_FILE_SUFFIX } from '../constants/file.constants';
import { fsErrorSummary } from './fs-error';
import { retryWhileBusy } from './json-file';

const logger = new Logger(REPLACE_FILE_LOG_CONTEXT);

/**
 * Lets `produce` write a file at a temp name beside `destination`, then moves it into place, so a
 * reader sees the old file or the whole new one. The temp name keeps the extension, which tools such as mpv and ffmpeg pick the file format from. False, with the old file kept, when `produce`
 * says it made nothing or left an empty file. A failure of `produce` or of the move is thrown, and the temp file never outlives the call.
 */
export async function replaceFileWith(
  destination: string,
  produce: (temp: string) => Promise<boolean>,
): Promise<boolean> {
  const temp = join(
    dirname(destination),
    `${randomUUID()}${TEMP_FILE_SUFFIX}${extname(destination)}`,
  );
  try {
    await mkdir(dirname(destination), { recursive: true });
    if (!(await produce(temp)) || (await stat(temp)).size === 0) return false;
    await retryWhileBusy(() => rename(temp, destination));
    return true;
  } finally {
    await rm(temp, { force: true }).catch((error: unknown) =>
      logger.warn(`Cannot remove ${temp}: ${fsErrorSummary(error)}`),
    );
  }
}
