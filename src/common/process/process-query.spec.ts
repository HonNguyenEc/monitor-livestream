import { inspectProcesses } from './process-image';

const onWindows = process.platform === 'win32' ? it : it.skip;

// Runs the real PowerShell query, against this test process itself, so a typo in the query cannot hide behind mocks.
describe('inspectProcesses on this machine', () => {
  onWindows('finds this process with its image and a creation time just before now', async () => {
    const found = await inspectProcesses([process.pid, 2_147_483_000]);

    expect(found).toHaveLength(1);
    expect(found?.[0]).toMatchObject({ pid: process.pid, image: 'node.exe' });
    expect(Date.now() - (found?.[0].createdMs ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Date.now() - (found?.[0].createdMs ?? 0)).toBeLessThan(3_600_000);
  });
});
