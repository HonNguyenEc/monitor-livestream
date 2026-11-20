import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Test } from '@nestjs/testing';

import { killProcessTree, spawnHidden } from '../../../common/process/hidden-process';
import { inspectProcesses } from '../../../common/process/process-image';
import { DATA_DIR } from '../../../config/data-dir.module';
import { childPidsPathOf } from '../../../config/runtime-artifacts';
import { ChildProcessRegistry } from './child-process-registry.service';

jest.mock('../../../common/process/hidden-process');
jest.mock('../../../common/process/process-image');

const spawnMock = spawnHidden as jest.Mock;
const killMock = killProcessTree as jest.Mock;
const inspectMock = inspectProcesses as jest.Mock;

const LAUNCHED = 1_700_000_000_000;

function fakeChild(pid: number | undefined): EventEmitter & { pid?: number } {
  return Object.assign(new EventEmitter(), { pid });
}

const running = (pid: number, image: string, createdMs = LAUNCHED): object => ({
  pid,
  image,
  createdMs,
});

describe('ChildProcessRegistry', () => {
  let dataDir: string;
  let registry: ChildProcessRegistry;
  let pidsPath: string;

  const eventually = async (check: () => Promise<void>): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await check();
      } catch (error) {
        if (attempt >= 50) throw error;
        await new Promise((done) => setTimeout(done, 20));
      }
    }
  };

  const recorded = async (): Promise<unknown> => JSON.parse(await readFile(pidsPath, 'utf8'));
  const writeRecorded = async (value: unknown): Promise<void> => {
    await mkdir(dirname(pidsPath), { recursive: true });
    await writeFile(pidsPath, JSON.stringify(value), 'utf8');
  };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'live-qc-registry-'));
    pidsPath = childPidsPathOf(dataDir);
    registry = new ChildProcessRegistry(dataDir);
    killMock.mockResolvedValue(true);
  });

  afterEach(async () => {
    jest.resetAllMocks();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('records a launched child with its image name and start time, and forgets it on exit', async () => {
    const child = fakeChild(4242);
    spawnMock.mockReturnValue(child);

    registry.launch('MPV.exe', ['--idle']);
    await eventually(async () =>
      expect(await recorded()).toEqual([
        { pid: 4242, image: 'mpv.exe', launchedAtMs: expect.any(Number) },
      ]),
    );

    child.emit('exit');
    await eventually(async () => expect(await recorded()).toEqual([]));
  });

  it('does not track a child that failed to start', async () => {
    spawnMock.mockReturnValue(fakeChild(undefined));

    registry.launch('missing.exe', []);
    await registry.killAll();

    expect(killMock).not.toHaveBeenCalled();
  });

  it('kills every tracked child on shutdown', async () => {
    spawnMock.mockReturnValueOnce(fakeChild(1)).mockReturnValueOnce(fakeChild(2));
    registry.launch('mpv.exe', []);
    registry.launch('mpv.exe', []);

    await registry.onModuleDestroy();

    expect(killMock.mock.calls.map(([pid]) => pid).sort()).toEqual([1, 2]);
    expect(await recorded()).toEqual([]);
  });

  it('does not sweep while the application starts, only when told to after it owns the port', async () => {
    await writeRecorded([{ pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED }]);
    inspectMock.mockResolvedValue([running(10, 'mpv.exe')]);
    const moduleRef = await Test.createTestingModule({
      providers: [ChildProcessRegistry, { provide: DATA_DIR, useValue: dataDir }],
    }).compile();

    await moduleRef.init();

    expect(inspectMock).not.toHaveBeenCalled();
    expect(killMock).not.toHaveBeenCalled();
    expect(await recorded()).toEqual([{ pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED }]);
    await moduleRef.close();
  });

  it('keeps a child in the list when its kill is not confirmed', async () => {
    spawnMock.mockReturnValue(fakeChild(5));
    registry.launch('mpv.exe', []);
    killMock.mockResolvedValue(false);

    await registry.kill(5);

    await eventually(async () =>
      expect(await recorded()).toEqual([
        { pid: 5, image: 'mpv.exe', launchedAtMs: expect.any(Number) },
      ]),
    );
  });

  describe('orphan sweep', () => {
    it('skips a child this instance already tracks, even when the query matches it', async () => {
      spawnMock.mockReturnValue(fakeChild(77));
      registry.launch('mpv.exe', []);
      await eventually(async () => expect(await recorded()).toHaveLength(1));
      inspectMock.mockResolvedValue([running(77, 'mpv.exe', Date.now())]);

      await registry.sweepOrphans();

      expect(inspectMock).toHaveBeenCalledWith([]);
      expect(killMock).not.toHaveBeenCalled();
      expect(await recorded()).toEqual([
        { pid: 77, image: 'mpv.exe', launchedAtMs: expect.any(Number) },
      ]);
    });

    it('keeps a record whose kill is not confirmed for the next start', async () => {
      await writeRecorded([{ pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED }]);
      inspectMock.mockResolvedValue([running(10, 'mpv.exe')]);
      killMock.mockResolvedValue(false);

      await registry.sweepOrphans();

      expect(await recorded()).toEqual([{ pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED }]);
    });

    it('never throws, so a failing sweep cannot take the listening service down', async () => {
      await writeRecorded([{ pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED }]);
      inspectMock.mockRejectedValue(new Error('query broke'));

      await expect(registry.sweepOrphans()).resolves.toBeUndefined();
      expect(killMock).not.toHaveBeenCalled();
    });

    it('kills a recorded pid that runs the same program since the recorded start, and only that one', async () => {
      await writeRecorded([
        { pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED },
        { pid: 11, image: 'mpv.exe', launchedAtMs: LAUNCHED },
        { pid: 12, image: 'mpv.exe', launchedAtMs: LAUNCHED },
        { pid: 13, image: 'mpv.exe', launchedAtMs: LAUNCHED },
      ]);
      inspectMock.mockResolvedValue([
        running(10, 'mpv.exe', LAUNCHED + 2_000),
        running(11, 'chrome.exe'),
        running(12, 'mpv.exe', LAUNCHED + 3_600_000),
      ]);

      await registry.sweepOrphans();

      expect(inspectMock).toHaveBeenCalledWith([10, 11, 12, 13]);
      expect(killMock.mock.calls).toEqual([[10]]);
      expect(await recorded()).toEqual([]);
    });

    it('asks about every pid in one query', async () => {
      await writeRecorded(
        Array.from({ length: 20 }, (_, index) => ({
          pid: 100 + index,
          image: 'mpv.exe',
          launchedAtMs: LAUNCHED,
        })),
      );
      inspectMock.mockResolvedValue([]);

      await registry.sweepOrphans();

      expect(inspectMock).toHaveBeenCalledTimes(1);
    });

    it('kills nothing and keeps the records when the processes cannot be listed', async () => {
      const records = [{ pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED }];
      await writeRecorded(records);
      inspectMock.mockResolvedValue(null);

      await registry.sweepOrphans();

      expect(killMock).not.toHaveBeenCalled();
      expect(await recorded()).toEqual(records);
    });

    it('keeps those records when the next launch rewrites the file', async () => {
      const records = [{ pid: 10, image: 'mpv.exe', launchedAtMs: LAUNCHED }];
      await writeRecorded(records);
      inspectMock.mockResolvedValue(null);
      await registry.sweepOrphans();
      spawnMock.mockReturnValue(fakeChild(77));

      registry.launch('mpv.exe', []);

      await eventually(async () =>
        expect(await recorded()).toEqual([
          ...records,
          { pid: 77, image: 'mpv.exe', launchedAtMs: expect.any(Number) },
        ]),
      );
    });

    it('moves an unreadable file aside instead of overwriting it, and kills nothing', async () => {
      await mkdir(dirname(pidsPath), { recursive: true });
      await writeFile(pidsPath, '{', 'utf8');

      await registry.sweepOrphans();

      expect(inspectMock).not.toHaveBeenCalled();
      expect(killMock).not.toHaveBeenCalled();
      const files = await readdir(dirname(pidsPath));
      expect(files).toEqual(['children.json.unreadable']);
      expect(await readFile(`${pidsPath}.unreadable`, 'utf8')).toBe('{');
    });

    it('never kills a record without a start time', async () => {
      await writeRecorded([{ pid: 10, image: 'mpv.exe' }, null, 'x', { pid: 'a' }]);
      inspectMock.mockResolvedValue([running(10, 'mpv.exe')]);

      await registry.sweepOrphans();

      expect(killMock).not.toHaveBeenCalled();
    });

    it('does nothing for a missing file', async () => {
      inspectMock.mockResolvedValue([]);

      await registry.sweepOrphans();

      expect(killMock).not.toHaveBeenCalled();
    });
  });
});
