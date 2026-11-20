import { runHidden } from './hidden-process';
import { inspectProcesses, parseProcessList } from './process-image';

jest.mock('./hidden-process');

const runMock = runHidden as jest.Mock;
const result = (over: object): object => ({
  exitCode: 0,
  stdout: '[]',
  stderr: '',
  timedOut: false,
  ...over,
});

describe('parseProcessList', () => {
  it('reads the processes a query printed, with the image in lower case', () => {
    const output = JSON.stringify([
      { pid: 10, name: 'MPV.exe', createdMs: 1700000000000 },
      { pid: 11, name: 'chrome.exe', createdMs: 1700000001000 },
    ]);

    expect(parseProcessList(output)).toEqual([
      { pid: 10, image: 'mpv.exe', createdMs: 1700000000000 },
      { pid: 11, image: 'chrome.exe', createdMs: 1700000001000 },
    ]);
  });

  it('reads `[]` as no process running', () => {
    expect(parseProcessList('[]')).toEqual([]);
  });

  it.each(['', '  ', 'not json', '{"pid":1}', '[{"pid":"x","name":"a","createdMs":1}]', '[null]'])(
    'refuses %p, so an unreadable or empty answer is never taken for "not running"',
    (output) => {
      expect(parseProcessList(output)).toBeNull();
    },
  );
});

describe('inspectProcesses', () => {
  const onWindows = process.platform === 'win32' ? it : it.skip;

  beforeEach(() => runMock.mockReset());

  onWindows('asks about all pids in one query and returns what it found', async () => {
    runMock.mockResolvedValue(
      result({ stdout: JSON.stringify([{ pid: 7, name: 'mpv.exe', createdMs: 5 }]) }),
    );

    const found = await inspectProcesses([7, 8]);

    expect(runMock).toHaveBeenCalledTimes(1);
    const args = runMock.mock.calls[0][1] as string[];
    expect(args.join(' ')).toContain('ProcessId=7 OR ProcessId=8');
    expect(found).toEqual([{ pid: 7, image: 'mpv.exe', createdMs: 5 }]);
  });

  onWindows('does not start a query for no pids', async () => {
    expect(await inspectProcesses([])).toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  (process.platform === 'win32' ? it.each : it.skip.each)([
    ['a failed query', { exitCode: 1, stderr: 'boom' }],
    ['a timed out query', { exitCode: null, timedOut: true }],
    ['an empty answer', { stdout: '' }],
    ['an answer that is not a list', { stdout: 'Access denied' }],
  ])('is null, not "nothing running", for %s', async (_case, over) => {
    runMock.mockResolvedValue(result(over));

    expect(await inspectProcesses([7])).toBeNull();
  });
});
