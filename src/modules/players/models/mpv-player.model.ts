/** The player the service launches, found once and described for building command lines. */
export interface MpvPlayer {
  path: string;
  /** True when this build knows `--media-controls`: the bundled copy, or mpv 0.42 and later. */
  supportsMediaControlsFlag: boolean;
}
