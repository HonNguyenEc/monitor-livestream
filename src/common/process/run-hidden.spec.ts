import { runHidden } from './hidden-process';

// Runs this Node binary as the child: a real process, but never mpv, ffmpeg, yt-dlp or reg.
const NODE = process.execPath;
const node = (script: string): string[] => ['-e', script];

describe('runHidden', () => {
  it('returns the output and a zero exit code', async () => {
    const result = await runHidden(NODE, node('console.log("out"); console.error("err")'), {
      timeoutMs: 20_000,
    });

    expect(result).toEqual({ exitCode: 0, stdout: 'out\n', stderr: 'err\n', timedOut: false });
  });

  it('reports a non-zero exit code as a result, not a throw', async () => {
    const result = await runHidden(NODE, node('console.error("bad"); process.exit(3)'), {
      timeoutMs: 20_000,
    });

    expect(result).toMatchObject({ exitCode: 3, stderr: 'bad\n', timedOut: false });
  });

  it('reports a program that cannot start with a null exit code', async () => {
    const result = await runHidden('definitely-not-a-program-xyz', [], { timeoutMs: 20_000 });

    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toContain('ENOENT');
  });

  it('kills a process that outlives the timeout', async () => {
    const started = Date.now();

    const result = await runHidden(NODE, node('setInterval(() => {}, 1000)'), { timeoutMs: 300 });

    expect(result).toMatchObject({ exitCode: null, timedOut: true });
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it('kills a process when the signal aborts, without calling it a timeout', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);

    const result = await runHidden(NODE, node('setInterval(() => {}, 1000)'), {
      timeoutMs: 60_000,
      signal: controller.signal,
    });

    expect(result).toMatchObject({ exitCode: null, timedOut: false });
  });

  it('does not start when the signal is already aborted', async () => {
    const result = await runHidden(NODE, node('console.log("ran")'), {
      timeoutMs: 20_000,
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({ exitCode: null, stdout: '', stderr: '', timedOut: false });
  });

  it('caps by bytes, not characters, for multi-byte output', async () => {
    const result = await runHidden(NODE, node('process.stdout.write("ệ".repeat(5000))'), {
      timeoutMs: 20_000,
      maxOutputBytes: 100,
    });

    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(100);
  });

  it('kills the whole tree on a timeout, not just the root', async () => {
    const script = [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
      'console.log(child.pid);',
      'setInterval(() => {}, 1000);',
    ].join(' ');

    const result = await runHidden(NODE, node(script), { timeoutMs: 1500 });

    const grandchild = Number(result.stdout.trim());
    expect(result.timedOut).toBe(true);
    expect(Number.isInteger(grandchild)).toBe(true);
    await new Promise((done) => setTimeout(done, 300));
    expect(() => process.kill(grandchild, 0)).toThrow();
  });

  it('does not hang when a grandchild keeps the output pipes open after the root exited', async () => {
    const script = [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: ["ignore", "inherit", "inherit"] });',
      'process.stdout.write(child.pid + "\\n", () => process.exit(0));',
    ].join(' ');

    const result = await runHidden(NODE, node(script), { timeoutMs: 20_000 });

    const grandchild = Number(result.stdout.trim());
    try {
      expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    } finally {
      process.kill(grandchild);
    }
  });

  it('keeps at most maxOutputBytes of each stream', async () => {
    const result = await runHidden(NODE, node('process.stdout.write("x".repeat(5000))'), {
      timeoutMs: 20_000,
      maxOutputBytes: 100,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toHaveLength(100);
  });
});
