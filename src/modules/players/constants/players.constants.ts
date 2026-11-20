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

export const MPV_PIPE_PREFIX = '\\\\.\\pipe\\livestream-qc-';
export const MPV_IPC_CONNECT_TIMEOUT_MS = 10_000;
export const MPV_IPC_CONNECT_RETRY_MS = 250;
// Same budget as the Python tool's IPC_TIMEOUT.
export const MPV_IPC_REQUEST_TIMEOUT_MS = 3_000;
export const MPV_IPC_SUCCESS = 'success';
export const MPV_PROPERTY_FRAME_NUMBER = 'estimated-frame-number';
export const MPV_COMMAND_GET_PROPERTY = 'get_property';
export const MPV_COMMAND_SCREENSHOT_TO_FILE = 'screenshot-to-file';
// `video` captures the decoded frame without OSD or subtitles.
export const MPV_SCREENSHOT_FLAGS = 'video';
