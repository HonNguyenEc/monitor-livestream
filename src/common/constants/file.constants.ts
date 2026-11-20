export const UTF8_BOM = String.fromCharCode(0xfeff);
export const FILE_NOT_FOUND = 'ENOENT';
export const TEMP_FILE_SUFFIX = '.tmp';
export const BUSY_FILE_CODES: readonly string[] = ['EPERM', 'EBUSY', 'EACCES'];
export const BUSY_FILE_ATTEMPTS = 5;
export const BUSY_FILE_RETRY_DELAY_MS = 50;
export const LINE_FEEDS = /\n/g;
