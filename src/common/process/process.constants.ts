export const HIDDEN_PROCESS_LOG_CONTEXT = 'HiddenProcess';
export const PROCESS_SUCCESS_EXIT_CODE = 0;
export const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
export const KILL_GRACE_MS = 2_000;
/** After the root process exits, how long a grandchild may keep the output pipes open before they are cut. */
export const EXIT_PIPE_GRACE_MS = 500;
export const KILL_TIMEOUT_MS = 10_000;

export const PROCESS_NOT_FOUND_ERRNO = 'ESRCH';
export const PROCESS_QUERY_LOG_CONTEXT = 'ProcessQuery';
export const PROCESS_QUERY_ERROR_EXCERPT = 300;
export const TASKKILL_EXE = 'taskkill';
/** taskkill says 128 for a process that no longer exists, which is as good as killed. */
export const TASKKILL_NOT_FOUND_EXIT = 128;
export const taskkillArgs = (pid: number): string[] => ['/T', '/F', '/PID', String(pid)];

export const POWERSHELL_EXE = 'powershell';
export const PROCESS_QUERY_TIMEOUT_MS = 20_000;
/** One query for every pid: name and creation time (ms since epoch) of the ones that run. */
export const processQueryArgs = (pids: readonly number[]): string[] => [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter '${pids.map((pid) => `ProcessId=${pid}`).join(' OR ')}' | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; name = $_.Name; createdMs = [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } })`,
];

/** Folder of the data directory that holds tools the installer or the operator drops in; searched before PATH. */
export const TOOLS_FOLDER = 'tools';
export const WINDOWS_EXE_SUFFIX = '.exe';
