import { ChildProcess, execFile, ExecFileOptions, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

// The packaged service is a GUI-subsystem process: a console child without windowsHide opens its own console.
export function spawnHidden(file: string, args: string[]): ChildProcess {
  return spawn(file, args, { stdio: 'ignore', windowsHide: true });
}

export async function execFileHidden(
  file: string,
  args: string[],
  options: Omit<ExecFileOptions, 'windowsHide' | 'encoding'> = {},
): Promise<ExecResult> {
  return execFileAsync(file, args, { ...options, encoding: 'utf8', windowsHide: true });
}
