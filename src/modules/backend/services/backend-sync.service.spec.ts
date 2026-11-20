import { HttpStatus, Logger } from '@nestjs/common';

import { FakeLoginState } from '../../../../test/helpers/fake-login-state';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { BackendApiClient } from '../clients/backend-api.client';
import { NO_HTTP_STATUS } from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendAuthError } from '../errors/backend-auth.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { BackendSchedule } from '../models/backend-schedule.model';
import { BackendSyncStore } from './backend-sync-store.service';
import { BackendSyncService } from './backend-sync.service';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const BRANDS = [{ id: 'b1', name: 'Brand One' }];
const ROW: BackendSchedule = {
  scheduleId: 's1',
  platform: 'shopee',
  sessionId: '1234567',
  scheduledAt: '2026-01-15T10:00:00+07:00',
  expectedEndAt: '2026-01-15T12:00:00+07:00',
  status: 'waiting',
  statusLabel: 'Waiting',
  scheduleStatus: 'scheduled',
};
const BOARD_REFRESH = 120 * SECOND;
const BOARD = new Map([['b1', [ROW]]]);
const failure = (
  status: number = HttpStatus.INTERNAL_SERVER_ERROR,
  retryAfter: number | null = null,
): BackendRequestError => new BackendRequestError('x', status, 'boom', retryAfter);

describe('BackendSyncService', () => {
  const noon = new Date(2026, 0, 15, 12, 0, 0).getTime();
  let session: FakeLoginState;
  let api: { brands: jest.Mock; board: jest.Mock };
  let store: BackendSyncStore;
  let service: BackendSyncService;

  const advance = async (ms: number): Promise<void> => {
    jest.setSystemTime(Date.now() + ms);
    await service.tick();
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: noon });
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    session = new FakeLoginState();
    api = {
      brands: jest.fn().mockResolvedValue(BRANDS),
      board: jest.fn().mockResolvedValue(BOARD),
    };
    store = new BackendSyncStore(session);
    service = new BackendSyncService(session, api as unknown as BackendApiClient, store);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('makes no call while not logged in', async () => {
    session.connected = false;

    await service.tick();

    expect(api.brands).not.toHaveBeenCalled();
    expect(api.board).not.toHaveBeenCalled();
    expect(store.brands).toEqual([]);
  });

  it("reads brands and today's board first, and reports the counts", async () => {
    await service.tick();

    expect(api.brands).toHaveBeenCalledTimes(1);
    expect(api.board).toHaveBeenCalledWith('2026-01-15');
    expect(store.brands).toEqual(BRANDS);
    expect(store.schedulesOf('b1')).toEqual([ROW]);
    expect(store.status).toEqual({
      syncedAt: new Date(noon).toISOString(),
      error: null,
      brands: 1,
      schedules: 1,
    });
  });

  it('refreshes the board every 120 s and the brands every 600 s', async () => {
    await service.tick();

    await advance(119 * SECOND);
    expect(api.board).toHaveBeenCalledTimes(1);

    await advance(1 * SECOND);
    expect(api.board).toHaveBeenCalledTimes(2);
    expect(api.brands).toHaveBeenCalledTimes(1);

    await advance(7 * MINUTE + 59 * SECOND);
    expect(api.brands).toHaveBeenCalledTimes(1);

    await advance(1 * SECOND);
    expect(api.brands).toHaveBeenCalledTimes(2);
  });

  it('reads the board again when the local date changes, but not the brands', async () => {
    jest.setSystemTime(new Date(2026, 0, 15, 23, 59, 30).getTime());
    await service.tick();

    await advance(60 * SECOND);

    expect(api.board).toHaveBeenCalledTimes(2);
    expect(api.board).toHaveBeenLastCalledWith('2026-01-16');
    expect(api.brands).toHaveBeenCalledTimes(1);
  });

  it('ticks every 30 s with an unref-ed timer, and stops on destroy', () => {
    const unref = jest.fn();
    const setIntervalSpy = jest
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref } as unknown as NodeJS.Timeout);
    const clearSpy = jest.spyOn(globalThis, 'clearInterval');

    service.onApplicationBootstrap();
    service.onModuleDestroy();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30 * SECOND);
    expect(unref).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('syncs on the 30 s tick of the running service until it is destroyed', async () => {
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(api.board).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2 * MINUTE);

    expect(api.board).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10 * MINUTE);
    expect(api.board).toHaveBeenCalledTimes(2);
  });

  it('keeps ticking after a tick throws, instead of leaving an unhandled rejection', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(store, 'markSynced').mockImplementationOnce(() => {
      throw new Error('store broke');
    });

    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(2 * MINUTE);

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Sync tick failed'));
    expect(api.board.mock.calls.length).toBeGreaterThanOrEqual(2);
    service.onModuleDestroy();
    error.mockRestore();
  });

  it('forces brands and board now, due or not', async () => {
    await service.tick();

    await service.syncNow();

    expect(api.brands).toHaveBeenCalledTimes(2);
    expect(api.board).toHaveBeenCalledTimes(2);
  });

  describe('a failed read', () => {
    it('keeps the last good lists and reports a masked reason', async () => {
      await service.tick();
      api.board.mockRejectedValue(failure());

      await service.syncNow();

      expect(store.brands).toEqual(BRANDS);
      expect(store.schedulesOf('b1')).toEqual([ROW]);
      expect(store.status).toMatchObject({ brands: 1, schedules: 1 });
      expect(store.status.error).toBe('Backend trả lỗi HTTP 500: boom');
      expect(store.status.syncedAt).toBe(new Date(noon).toISOString());
    });

    it('waits 60 s, then doubles up to 600 s, over the failures', async () => {
      api.brands.mockRejectedValue(failure());
      const waits: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const start = Date.now();
        await service.tick();
        api.brands.mockClear();
        do {
          jest.setSystemTime(Date.now() + SECOND);
          await service.tick();
        } while (api.brands.mock.calls.length === 0);
        waits.push(Date.now() - start);
        api.brands.mockClear();
      }

      expect(waits).toEqual([60, 120, 240, 480, 600, 600].map((s) => s * SECOND));
    });

    it('honours Retry-After, capped at 600 s', async () => {
      api.brands.mockRejectedValueOnce(failure(HttpStatus.TOO_MANY_REQUESTS, 200));
      await service.tick();
      await advance(199 * SECOND);
      expect(api.brands).toHaveBeenCalledTimes(1);
      api.brands.mockRejectedValueOnce(failure(HttpStatus.SERVICE_UNAVAILABLE, 5000));

      await advance(1 * SECOND);
      expect(api.brands).toHaveBeenCalledTimes(2);

      await advance(599 * SECOND);
      expect(api.brands).toHaveBeenCalledTimes(2);
      await advance(1 * SECOND);
      expect(api.brands).toHaveBeenCalledTimes(3);
    });

    it('lets a forced sync through the backoff, and a success clears the error and the backoff', async () => {
      api.brands.mockRejectedValueOnce(failure());
      await service.tick();
      expect(store.status.error).not.toBeNull();

      await service.syncNow();

      expect(store.status.error).toBeNull();
      expect(api.brands).toHaveBeenCalledTimes(2);
      await advance(121 * SECOND);
      expect(api.board).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['no answer', new BackendRequestError('x', NO_HTTP_STATUS), 'Không kết nối được backend.'],
      ['an unusable answer', new BackendAnswerError('x'), 'Backend trả về dữ liệu không hợp lệ.'],
    ])('reports %s', async (_case, error, text) => {
      api.brands.mockRejectedValue(error);

      await service.tick();

      expect(store.status.error).toBe(text);
    });

    it('logs the own message and the cause, masked, beside the Vietnamese status text', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      api.brands.mockRejectedValueOnce(
        new BackendRequestError('Backend did not answer', NO_HTTP_STATUS, '', null, {
          cause: new Error('connect ECONNREFUSED token=abc.def'),
        }),
      );
      await service.tick();
      api.brands.mockRejectedValueOnce(new BackendAnswerError('Brand without an id'));
      await service.syncNow();

      const lines = warn.mock.calls.map((call) => String(call[0]));
      expect(lines[0]).toContain('ECONNREFUSED token=[redacted]');
      expect(lines[1]).toContain('Brand without an id');
      expect(lines.join()).not.toContain('abc.def');
      expect(store.status.error).toBe(ErrorMessage.backendAnswerInvalid);
    });

    it('masks the text of an unexpected error', async () => {
      api.brands.mockRejectedValue(new Error('failed with token=abc.def'));

      await service.tick();

      expect(store.status.error).toBe('failed with token=[redacted]');
    });
  });

  describe('a lost login', () => {
    it('ignores a refusal that ended an older login than the current one', async () => {
      let fail: (error: Error) => void = () => undefined;
      api.brands.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
      const running = service.syncNow();
      await jest.advanceTimersByTimeAsync(0);

      const refused = new BackendAuthError('x', HttpStatus.UNAUTHORIZED);
      refused.endedEpoch = session.epoch + 1;
      session.relogin();
      session.relogin();
      fail(refused);
      await running;

      expect(store.status.error).toBeNull();
    });

    it('clears everything synced and says why when the refresh token is refused', async () => {
      await service.tick();
      api.board.mockImplementation(() => {
        session.connected = false;
        const refused = new BackendAuthError('x', HttpStatus.UNAUTHORIZED);
        refused.endedEpoch = session.epoch;
        return Promise.reject(refused);
      });

      await service.syncNow();

      expect(store.brands).toEqual([]);
      expect(store.status).toEqual({
        syncedAt: null,
        error: 'Phiên đăng nhập backend đã hết hạn, hãy đăng nhập lại.',
        brands: 0,
        schedules: 0,
      });
    });

    it('drops the data on reset, and the next sync starts over', async () => {
      await service.tick();

      service.reset();

      expect(store.brands).toEqual([]);
      expect(store.schedulesOf('b1')).toEqual([]);
      expect(store.status).toEqual({ syncedAt: null, error: null, brands: 0, schedules: 0 });
      await service.tick();
      expect(api.brands).toHaveBeenCalledTimes(2);
    });

    it('hides rows while logged out even before the next sync notices', async () => {
      await service.tick();

      session.connected = false;

      expect(store.brands).toEqual([]);
      expect(store.schedulesOf('b1')).toEqual([]);
      expect(store.status.brands).toBe(0);
    });

    it('discards the answer of a sync that was running when the login was reset', async () => {
      let release: (value: unknown) => void = () => undefined;
      api.brands.mockReturnValue(new Promise((resolve) => (release = resolve)));
      const running = service.syncNow();
      await jest.advanceTimersByTimeAsync(0);

      session.relogin();
      service.reset();
      release(BRANDS);
      await running;

      expect(store.brands).toEqual([]);
      expect(store.status.syncedAt).toBeNull();
    });

    it('discards a failure that arrives after the login was reset', async () => {
      let fail: (error: Error) => void = () => undefined;
      api.brands.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
      const running = service.syncNow();
      await jest.advanceTimersByTimeAsync(0);

      session.relogin();
      service.reset();
      fail(failure());
      await running;

      expect(store.status.error).toBeNull();
    });
  });

  it('runs one sync at a time', async () => {
    let release: (value: unknown) => void = () => undefined;
    api.brands.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));

    const first = service.tick();
    const second = service.tick();
    release(BRANDS);
    await Promise.all([first, second]);

    expect(api.brands).toHaveBeenCalledTimes(1);
  });

  describe('a forced sync while one is running', () => {
    const pending = <T>(): { promise: Promise<T>; release: (value: T) => void } => {
      let release: (value: T) => void = () => undefined;
      return { promise: new Promise<T>((resolve) => (release = resolve)), release };
    };

    it('joins a running full sync and reuses its answer', async () => {
      const brands = pending<typeof BRANDS>();
      api.brands.mockReturnValueOnce(brands.promise);
      const tick = service.tick();
      await jest.advanceTimersByTimeAsync(0);

      const forced = service.syncNow();
      brands.release(BRANDS);
      await Promise.all([tick, forced]);

      expect(api.brands).toHaveBeenCalledTimes(1);
      expect(api.board).toHaveBeenCalledTimes(1);
    });

    it('waits for a running partial tick, then reads both', async () => {
      await service.tick();
      const board = pending<typeof BOARD>();
      api.board.mockReturnValueOnce(board.promise);
      const tick = advance(BOARD_REFRESH);
      await jest.advanceTimersByTimeAsync(0);

      const forced = service.syncNow();
      await jest.advanceTimersByTimeAsync(0);
      expect(api.brands).toHaveBeenCalledTimes(1);
      board.release(BOARD);
      await Promise.all([tick, forced]);

      expect(api.brands).toHaveBeenCalledTimes(2);
      expect(api.board).toHaveBeenCalledTimes(3);
    });

    it('makes one round trip for a login during a tick of the previous login, without waiting for it', async () => {
      const staleBrands = pending<typeof BRANDS>();
      api.brands.mockReturnValueOnce(staleBrands.promise);
      const tick = service.tick();
      await jest.advanceTimersByTimeAsync(0);

      session.relogin();
      service.reset();
      await service.syncNow();

      expect(api.brands).toHaveBeenCalledTimes(2);
      expect(api.board).toHaveBeenCalledTimes(1);
      expect(store.brands).toEqual(BRANDS);
      staleBrands.release([{ id: 'old', name: 'Old' }]);
      await tick;
      expect(store.brands).toEqual(BRANDS);
    });

    it('shares one sync between two forced requests', async () => {
      await Promise.all([service.syncNow(), service.syncNow()]);

      expect(api.brands).toHaveBeenCalledTimes(1);
    });
  });

  it('discards both lists when the board fails after the brands were read', async () => {
    api.board.mockRejectedValue(failure());

    await service.tick();

    expect(store.brands).toEqual([]);
    expect(store.status).toMatchObject({ syncedAt: null, brands: 0 });
    expect(store.status.error).not.toBeNull();
  });
});
