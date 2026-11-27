import { Detector } from '../../../common/enums/detector.enum';
import { WallSettingsDto } from './wall-settings.dto';
import { WallTileDto } from './wall-tile.dto';

export class WallResponseDto {
  settings: WallSettingsDto;
  detector: Detector;
  tiles: WallTileDto[];
}
