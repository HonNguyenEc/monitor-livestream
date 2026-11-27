export const BUNDLED_MPV_FOLDER = 'mpv';
export const MPV_EXE = 'mpv.exe';
export const MPVNET_EXE = 'mpvnet.exe';
// Executable names, not bare commands: a bare `mpv` resolves to the console wrapper mpv.com first.
export const PATH_PLAYER_NAMES = [MPV_EXE, MPVNET_EXE];

export const DEFAULT_PROGRAM_FILES = 'C:\\Program Files';
export const LOCAL_APPDATA_FALLBACK = ['AppData', 'Local'];
export const WINGET_DIR = ['Microsoft', 'WinGet'];
export const WINGET_LINKS_FOLDER = 'Links';
export const WINGET_PACKAGES_FOLDER = 'Packages';
export const WINGET_MPV_PACKAGE_PREFIX = 'shinchiro.mpv_';
export const PROGRAM_FILES_MPV_FOLDERS = ['MPV Player', 'mpv'];
export const SCOOP_MPV_DIR = ['scoop', 'apps', 'mpv', 'current'];
export const MPVNET_FALLBACK_DIR = ['Programs', 'mpv.net'];

export const REG_EXE = 'reg';
export const UNINSTALL_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
// Same order as the Python tool: per-user installs win over machine-wide ones.
export const REGISTRY_HIVES = ['HKCU', 'HKLM'];
export const REGISTRY_ROOT_PREFIX = 'HKEY_';
export const DISPLAY_NAME_VALUE = 'DisplayName';
export const INSTALL_LOCATION_VALUE = 'InstallLocation';
export const REGISTRY_MPV_MARKER = 'mpv';
export const REG_QUERY_TIMEOUT_MS = 10_000;
export const REG_QUERY_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

// Not the Python tool's `livestream-qc-`, so a parity run next to this service never shares a pipe.
export const MPV_PIPE_PREFIX = '\\\\.\\pipe\\live-qc-';
export const LAUNCH_ID_LENGTH = 8;
export const MPV_IPC_CONNECT_TIMEOUT_MS = 10_000;
export const MPV_IPC_CONNECT_RETRY_MS = 250;
// Same budget as the Python tool's IPC_TIMEOUT.
export const MPV_IPC_REQUEST_TIMEOUT_MS = 3_000;
// mpv replies are one short line; a longer unterminated line means a broken peer.
export const MPV_IPC_MAX_BUFFER_CHARS = 1024 * 1024;
export const MPV_IPC_SUCCESS = 'success';
export const MPV_PROPERTY_FRAME_NUMBER = 'estimated-frame-number';
export const MPV_COMMAND_GET_PROPERTY = 'get_property';
export const MPV_COMMAND_SCREENSHOT_TO_FILE = 'screenshot-to-file';
// `video` captures the decoded frame without OSD or subtitles.
export const MPV_SCREENSHOT_FLAGS = 'video';

export const LINE_SEPARATOR = '\n';

export const MPV_CONFIG_DIR_ARG = '--config-dir=';
export const MPV_NO_TERMINAL_ARG = '--no-terminal';
export const MPVNET_MULTI_INSTANCE_ARG = '--process-instance=multi';

export const MPV_NO_VIDEO_ARGS = ['--vo=null', '--ao=null'];
export const MPV_MUTE_ARG = '--mute=yes';
export const MPV_NO_MEDIA_CONTROLS_ARG = '--media-controls=no';
export const MPV_IPC_SERVER_ARG = '--input-ipc-server=';
export const MPV_FORCE_WINDOW_ARG = '--force-window=yes';
export const MPV_KEEP_OPEN_ARG = '--keep-open=no';
export const MPV_TITLE_ARG = '--title=';
export const MPV_VERSION_ARG = '--version';
export const MPV_VERSION_TIMEOUT_MS = 10_000;
/** The first mpv that knows --media-controls; an older one refuses to start on the unknown option. */
export const MPV_MEDIA_CONTROLS_MIN_MINOR = 42;
export const MPV_VERSION_PATTERN = /mpv[ -]v?(\d+)\.(\d+)/i;
/** How long a missing player is believed before looking again, so installing mpv needs no restart. */
export const MPV_MISSING_RECHECK_MS = 30_000;
