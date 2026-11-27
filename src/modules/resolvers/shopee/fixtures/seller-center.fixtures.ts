import { JsonResponse } from '../../../../common/http/get-json';
import {
  SESSION_ID,
  SHARE_LINK,
  SHORT_LINK,
  TEST_COOKIE,
  USER_ID,
} from '../../../shopee/fixtures/seller-center.fixtures';

export { SESSION_ID, SHARE_LINK, SHORT_LINK, TEST_COOKIE, USER_ID };

export const STREAM_URL = 'https://example.invalid/live/stream.flv';
export const SESSION_TITLE = 'Synthetic show';

export const ongoingFound = (): JsonResponse => ({
  status: 200,
  data: { err_code: 0, data: { ongoing_live: { session_id: SESSION_ID, title: SESSION_TITLE } } },
});
export const ongoingNone = (): JsonResponse => ({
  status: 200,
  data: { err_code: 0, data: { ongoing_live: null } },
});
export const ongoingErrCode = (): JsonResponse => ({ status: 200, data: { err_code: 5 } });
export const ongoingErrorOnly = (): JsonResponse => ({ status: 500, data: { error: 'boom' } });
export const ongoingEmpty = (): JsonResponse => ({ status: 502, data: {} });

export const liveInfo = (overrides: Record<string, unknown> = {}): JsonResponse => ({
  status: 200,
  data: {
    code: 0,
    data: {
      sessionStatus: 1,
      sessionStreamingUrl: STREAM_URL,
      sessionTitle: SESSION_TITLE,
      ...overrides,
    },
  },
});
export const infoHttp403 = (): JsonResponse => ({ status: 403, data: { msg: 'forbidden' } });
export const infoBadCode = (): JsonResponse => ({
  status: 200,
  data: { code: 1, message: 'expired' },
});
export const infoNoData = (): JsonResponse => ({ status: 200, data: { code: 0, data: {} } });
