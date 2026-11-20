import { Injectable } from '@nestjs/common';

import {
  BOARD_DATE_PARAM,
  BOARD_PATH,
  BRANDS_PATH,
  PLAY_URL_SESSION_PARAM,
  playUrlPath,
} from '../constants/backend.constants';
import { BackendBrand } from '../models/backend-brand.model';
import { BackendSchedule } from '../models/backend-schedule.model';
import { PlayUrlAnswer } from '../models/play-url-answer.model';
import { BackendSessionService } from '../services/backend-session.service';
import { readBoard, readBrands, readPlayUrl } from '../utils/backend-answers';

/**
 * The reads the QC tool makes of livestream-backend, as in `BackendClient` of backend_client.py.
 * Each throws BackendAuthError without a login, BackendRequestError for a failed or unusable answer.
 */
@Injectable()
export class BackendApiClient {
  constructor(private readonly session: BackendSessionService) {}

  /** The brands the logged-in account can see; the backend scopes the list. */
  async brands(): Promise<BackendBrand[]> {
    return readBrands(await this.session.get(BRANDS_PATH));
  }

  /** The schedules of every brand the account can see on `day` (YYYY-MM-DD), grouped by brand id. */
  async board(day: string): Promise<Map<string, BackendSchedule[]>> {
    return readBoard(await this.session.get(BOARD_PATH, { [BOARD_DATE_PARAM]: day }));
  }

  /** Signed pull URL of a brand's session; an empty `sessionId` means the brand's current one. */
  async playUrl(brandId: string, sessionId: string, timeoutMs?: number): Promise<PlayUrlAnswer> {
    const query = { [PLAY_URL_SESSION_PARAM]: sessionId };
    return readPlayUrl(await this.session.get(playUrlPath(brandId), query, timeoutMs));
  }
}
