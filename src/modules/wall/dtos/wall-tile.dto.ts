import { LayoutTileDto } from '../../layout/dtos/layout-tile.dto';

export class WallTileDto extends LayoutTileDto {
  /** Signed HTTP-FLV URL of a live shop; it expires, so refresh it when playback fails. */
  url: string | null;
}
