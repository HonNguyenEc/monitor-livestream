export class LayoutTileDto {
  key: string;
  label: string;
  live: boolean;
  /** False when the tile does not fit in rows × columns. */
  visible: boolean;
}
