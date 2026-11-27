import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOG_FILE, LOG_ROTATION_RETRY_MS, ROTATED_LOG_SUFFIX } from '../constants/app.constants';
import { LogFile, redirectOutputToLogFile } from './log-file';

const MAX_BYTES = 10;

// A plain copy, so single fs calls can be made to fail; the real module's exports cannot be spied on.
jest.mock('node:fs', () => ({ ...jest.requireActual('node:fs') }));
const fs: typeof import('node:fs') = jest.requireMock('node:fs');

describe('log file', () => {
  const newLogPath = (): string => join(mkdtempSync(join(tmpdir(), 'live-qc-log-')), LOG_FILE);

  describe('LogFile', () => {
    it('never rotates before rotation is enabled, even past the limit', () => {
      const logPath = newLogPath();
      writeFileSync(logPath, 'x'.repeat(MAX_BYTES + 1));
      const logFile = new LogFile(logPath, MAX_BYTES);

      logFile.write('more\n');

      expect(readFileSync(logPath, 'utf8')).toBe(`${'x'.repeat(MAX_BYTES + 1)}more\n`);
      expect(existsSync(`${logPath}${ROTATED_LOG_SUFFIX}`)).toBe(false);
    });

    it('keeps appending while the file stays within the limit', () => {
      const logPath = newLogPath();
      const logFile = new LogFile(logPath, MAX_BYTES);
      logFile.enableRotation();

      logFile.write('x'.repeat(MAX_BYTES));

      expect(readFileSync(logPath, 'utf8')).toHaveLength(MAX_BYTES);
      expect(existsSync(`${logPath}${ROTATED_LOG_SUFFIX}`)).toBe(false);
    });

    it('moves the file aside once a write passes the limit and continues in a new file', () => {
      const logPath = newLogPath();
      writeFileSync(`${logPath}${ROTATED_LOG_SUFFIX}`, 'older');
      const logFile = new LogFile(logPath, MAX_BYTES);
      logFile.enableRotation();

      logFile.write('x'.repeat(MAX_BYTES));
      logFile.write('y');
      logFile.write('next\n');

      expect(readFileSync(`${logPath}${ROTATED_LOG_SUFFIX}`, 'utf8')).toBe(
        `${'x'.repeat(MAX_BYTES)}y`,
      );
      expect(readFileSync(logPath, 'utf8')).toBe('next\n');
    });

    describe('when the file system fails', () => {
      afterEach(() => jest.restoreAllMocks());

      it('keeps writing while the rotated file is locked and retries the rotation later', () => {
        const logPath = newLogPath();
        let now = 0;
        const logFile = new LogFile(logPath, MAX_BYTES, () => now);
        logFile.enableRotation();
        const rename = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
          throw new Error('EBUSY');
        });

        logFile.write('x'.repeat(MAX_BYTES + 1));
        logFile.write('y');
        expect(rename).toHaveBeenCalledTimes(1);

        now = LOG_ROTATION_RETRY_MS;
        logFile.write('z');

        expect(rename).toHaveBeenCalledTimes(2);
        expect(readFileSync(`${logPath}${ROTATED_LOG_SUFFIX}`, 'utf8')).toBe(
          `${'x'.repeat(MAX_BYTES + 1)}yz`,
        );
      });

      it('drops a line it cannot write and recovers on the next one', () => {
        const logPath = newLogPath();
        const logFile = new LogFile(logPath, MAX_BYTES);
        logFile.enableRotation();
        jest.spyOn(fs, 'openSync').mockImplementationOnce(() => {
          throw new Error('EACCES');
        });

        logFile.write('x'.repeat(MAX_BYTES + 1));
        expect(() => logFile.write('lost\n')).not.toThrow();
        logFile.write('kept\n');

        expect(readFileSync(logPath, 'utf8')).toBe('kept\n');
      });
    });
  });

  describe('redirectOutputToLogFile', () => {
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;

    afterEach(() => {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
    });

    const newDir = (): string => mkdtempSync(join(tmpdir(), 'live-qc-log-'));
    // A file where the folder should be makes the folder impossible to create.
    const unusableDir = (): string => {
      const blocker = join(newDir(), 'blocker');
      writeFileSync(blocker, '');
      return join(blocker, 'logs');
    };

    it('creates the folder and appends stdout and stderr to the log', () => {
      const logDir = join(newDir(), 'logs');
      const callback = jest.fn();

      const logFile = redirectOutputToLogFile(logDir, join(newDir(), 'fallback'));
      process.stdout.write('out\n', callback);
      process.stderr.write(Buffer.from('err\n'));

      expect(logFile?.path).toBe(join(logDir, LOG_FILE));
      expect(readFileSync(join(logDir, LOG_FILE), 'utf8')).toBe('out\nerr\n');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('logs to the fallback folder and says why when the log folder is unusable', () => {
      const logDir = unusableDir();
      const fallbackLogDir = join(newDir(), 'fallback');

      const logFile = redirectOutputToLogFile(logDir, fallbackLogDir);
      process.stdout.write('out\n');

      expect(logFile?.path).toBe(join(fallbackLogDir, LOG_FILE));
      const lines = readFileSync(join(fallbackLogDir, LOG_FILE), 'utf8').split('\n');
      expect(lines[0]).toContain(`Log folder ${logDir} is unusable (`);
      expect(lines[0]).toContain(`logging to ${fallbackLogDir} instead`);
      expect(lines[1]).toBe('out');
    });

    it('keeps the original output when no log folder is usable', () => {
      const logFile = redirectOutputToLogFile(unusableDir(), unusableDir());

      expect(logFile).toBeUndefined();
      expect(process.stdout.write).toBe(originalStdout);
      expect(process.stderr.write).toBe(originalStderr);
    });
  });
});
