import { HttpStatus, Logger } from '@nestjs/common';

import { FakeLoginState } from '../../../../test/helpers/fake-login-state';
import { Platform } from '../../../common/enums/platform.enum';
import { BackendApiClient } from '../../backend/clients/backend-api.client';
import { BackendAnswerError } from '../../backend/errors/backend-answer.error';
import { BackendAuthError } from '../../backend/errors/backend-auth.error';
import { BackendRequestError } from '../../backend/errors/backend-request.error';
import { BackendSchedule } from '../../backend/models/backend-schedule.model';
import { PlayUrlAnswer } from '../../backend/models/play-url-answer.model';
import { BackendPlayUrlGateway } from '../../backend/services/backend-play-url.gateway';
import { BackendSyncStore } from '../../backend/services/backend-sync-store.service';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { BackendPlayUrlResolver } from './backend-play-url.resolver';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const BRAND = 'brand-1';
const REQUEST = { key: 'shopee_api_x', platform: Platform.SHOPEE, brandId: BRAND };
const PLAY_URL = 'https://play.example.invalid/live.flv?sign=secret';

const answer = (overrides: Partial<PlayUrlAnswer> = {}): PlayUrlAnswer => ({
  sessionId: '1234567',
  shopeeStatus: 1,
  isLive: true,
  title: 'Title',
  shareUrl: null,
  playUrl: PLAY_URL,
  expiresAt: null,
  ...overrides,
});
const offline = (): PlayUrlAnswer =>
  answer({ isLive: false, shopeeStatus: 0, playUrl: '', title: null });
const failure = (status: number, retryAfter: number | null = null): BackendRequestError =>
  new BackendRequestError('x', status, 'down', retryAfter);

function schedule(id: string, minutesFromNow: number, status = 'scheduled'): BackendSchedule {
  const start = Date.now() + minutesFromNow * MINUTE;
  return {
    scheduleId: id,
    platform: 'shopee',
    sessionId: `session-${id}`,
    scheduledAt: new Date(start).toISOString(),
    expectedEndAt: new Date(start + 60 * MINUTE).toISOString(),
    status: null,
    statusLabel: null,
    scheduleStatus: status,
  };
}

describe('BackendPlayUrlResolver', () => {
  let session: FakeLoginState;
  let api: { playUrl: jest.Mock };
  let store: BackendSyncStore;
  let resolver: BackendPlayUrlResolver;

  const asked = (): string[] => api.playUrl.mock.calls.map((call) => call[1] as string);
  const endLogin = (): void => {
    session.relogin();
    store.clear();
  };
  const advance = (ms: number): void => jest.setSystemTime(Date.now() + ms);

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 0, 15, 12, 0, 0) });
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    session = new FakeLoginState();
    api = { playUrl: jest.fn().mockResolvedValue(offline()) };
    store = new BackendSyncStore(session);
    resolver = new BackendPlayUrlResolver(
      new BackendPlayUrlGateway(session, api as unknown as BackendApiClient, store),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('without a login', () => {
    it.each([
      ['not logged in', { ...REQUEST }, false],
      ['a request without a brand id', { key: 'k', platform: Platform.SHOPEE }, true],
    ])(
      'fails with backend_not_connected and calls nothing: %s',
      async (_case, request, connected) => {
        session.connected = connected;

        const result = await resolver.resolve(request);

        expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.BACKEND_NOT_CONNECTED });
        expect(api.playUrl).not.toHaveBeenCalled();
      },
    );
  });

  describe('which sessions it asks', () => {
    it('asks only the current session when no schedule is on air', async () => {
      store.setBoard(new Map([[BRAND, [schedule('later', 600), schedule('earlier', -600)]]]));

      await resolver.resolve(REQUEST);

      expect(asked()).toEqual(['']);
    });

    it('asks the on-air schedules, live first then latest start, before the current session', async () => {
      store.setBoard(
        new Map([
          [
            BRAND,
            [
              schedule('old', -30),
              schedule('new', -5),
              schedule('live', -50, 'live'),
              schedule('cancelled', -5, 'cancelled'),
            ],
          ],
        ]),
      );

      await resolver.resolve(REQUEST);

      expect(asked()).toEqual(['session-live', 'session-new', 'session-old', '']);
    });

    it('asks a session shared by two schedules once', async () => {
      store.setBoard(
        new Map([
          [
            BRAND,
            [
              { ...schedule('a', -5), sessionId: 'same' },
              { ...schedule('b', -6), sessionId: 'same' },
            ],
          ],
        ]),
      );

      await resolver.resolve(REQUEST);

      expect(asked()).toEqual(['same', '']);
    });

    it('stops at the first live session and records it, masked, for the shop detail', async () => {
      store.setBoard(new Map([[BRAND, [schedule('a', -5), schedule('b', -10)]]]));
      api.playUrl.mockResolvedValueOnce(offline()).mockResolvedValueOnce(answer());

      const result = await resolver.resolve(REQUEST);

      expect(result).toEqual({
        ok: true,
        urls: [PLAY_URL],
        detail: 'session •••4567 via the backend (Title)',
      });
      expect(asked()).toEqual(['session-a', 'session-b']);
      expect(store.sessionOf(BRAND)).toMatchObject({
        sessionId: '•••4567',
        isLive: true,
        scheduleId: 'b',
        source: 'theo lịch',
      });
      expect(JSON.stringify(store.sessionOf(BRAND))).not.toContain('secret');
      expect(store.onAirSchedule(BRAND)?.scheduleId).toBe('b');
    });

    it('reports the first failure when none is live', async () => {
      store.setBoard(new Map([[BRAND, [schedule('a', -5)]]]));
      api.playUrl
        .mockResolvedValueOnce(answer({ isLive: false, shopeeStatus: 2, sessionId: 'abcdefg' }))
        .mockResolvedValueOnce(offline());

      const result = await resolver.resolve(REQUEST);

      expect(result).toEqual({
        ok: false,
        code: ResolveFailureCode.NOT_LIVE,
        detail: 'not_live: session •••defg (theo lịch) shopee_status=2',
      });
    });

    it('fails with no_play_url when the session is live but gives no URL', async () => {
      api.playUrl.mockResolvedValue(answer({ playUrl: '' }));

      const result = await resolver.resolve(REQUEST);

      expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.NO_PLAY_URL });
    });

    it('reads a 400 as a brand without an API session, not as a failure', async () => {
      api.playUrl.mockRejectedValue(failure(HttpStatus.BAD_REQUEST));

      const first = await resolver.resolve(REQUEST);
      const second = await resolver.resolve(REQUEST);

      expect(first).toMatchObject({ ok: false, code: ResolveFailureCode.NOT_LIVE });
      expect(second).toMatchObject({ ok: false, code: ResolveFailureCode.NOT_LIVE });
      expect(api.playUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('the per-session cache', () => {
    it('reuses a live answer for 60 s, then asks again', async () => {
      api.playUrl.mockResolvedValue(answer());
      await resolver.resolve(REQUEST);

      advance(59 * SECOND);
      const cached = await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(1);
      expect(cached).toMatchObject({ ok: true, urls: [PLAY_URL] });
      expect((cached as { detail: string }).detail).toContain('[cached, asking again in 1s]');

      advance(1 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it('never reuses a live answer past 60 s before the URL expires', async () => {
      api.playUrl.mockResolvedValue(
        answer({ expiresAt: new Date(Date.now() + 90 * SECOND).toISOString() }),
      );
      await resolver.resolve(REQUEST);

      advance(29 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(1);

      advance(1 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it('does not reuse a live answer whose URL expires within 60 s', async () => {
      api.playUrl.mockResolvedValue(
        answer({ expiresAt: new Date(Date.now() + 30 * SECOND).toISOString() }),
      );

      await resolver.resolve(REQUEST);
      await resolver.resolve(REQUEST);

      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it('reuses an off answer for 60 s while a schedule is on air', async () => {
      store.setBoard(new Map([[BRAND, [schedule('a', -5)]]]));
      await resolver.resolve(REQUEST);
      const calls = api.playUrl.mock.calls.length;

      advance(59 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(calls);

      advance(1 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl.mock.calls.length).toBeGreaterThan(calls);
    });

    it('reuses an off answer for 600 s while nothing is on air', async () => {
      await resolver.resolve(REQUEST);

      advance(599 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(1);

      advance(1 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it('asks about a schedule that goes on air even while the current session is cached', async () => {
      await resolver.resolve(REQUEST);
      store.setBoard(new Map([[BRAND, [schedule('fresh', -1)]]]));

      await resolver.resolve(REQUEST);

      expect(asked()).toEqual(['', 'session-fresh']);
    });

    it('keeps the answers of different brands apart', async () => {
      await resolver.resolve(REQUEST);
      await resolver.resolve({ ...REQUEST, brandId: 'brand-2' });

      expect(api.playUrl.mock.calls.map((call) => call[0])).toEqual([BRAND, 'brand-2']);
    });
  });

  describe('after a failure', () => {
    it('waits 30, 60, 120, then 300 s for ever, and a success starts over', async () => {
      api.playUrl.mockRejectedValue(failure(HttpStatus.INTERNAL_SERVER_ERROR));
      const waitForNextCall = async (): Promise<number> => {
        const calls = api.playUrl.mock.calls.length;
        const start = Date.now();
        while (api.playUrl.mock.calls.length === calls) {
          advance(SECOND);
          await resolver.resolve(REQUEST);
        }
        return Date.now() - start;
      };
      await resolver.resolve(REQUEST);

      const waits: number[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) waits.push(await waitForNextCall());

      expect(waits).toEqual([30, 60, 120, 300, 300].map((s) => s * SECOND));
      api.playUrl.mockResolvedValue(offline());
      await waitForNextCall();
      api.playUrl.mockRejectedValue(failure(HttpStatus.INTERNAL_SERVER_ERROR));
      advance(600 * SECOND);
      await resolver.resolve(REQUEST);

      expect(await waitForNextCall()).toBe(30 * SECOND);
    });

    it('reports a backend_error with the masked reason', async () => {
      api.playUrl.mockRejectedValue(failure(HttpStatus.BAD_GATEWAY));

      const result = await resolver.resolve(REQUEST);

      expect(result).toEqual({
        ok: false,
        code: ResolveFailureCode.BACKEND_ERROR,
        detail: 'backend_error: Backend trả lỗi HTTP 502: down',
      });
    });

    it('honours Retry-After instead of the backoff', async () => {
      api.playUrl.mockRejectedValue(failure(HttpStatus.TOO_MANY_REQUESTS, 90));
      await resolver.resolve(REQUEST);

      advance(89 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(1);

      advance(1 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it('does not try the next session while the backend is failing', async () => {
      store.setBoard(new Map([[BRAND, [schedule('a', -5), schedule('b', -10)]]]));
      api.playUrl.mockRejectedValue(failure(HttpStatus.SERVICE_UNAVAILABLE));

      await resolver.resolve(REQUEST);

      expect(api.playUrl).toHaveBeenCalledTimes(1);
    });

    it('caps a huge Retry-After at the sync backoff of 600 s', async () => {
      api.playUrl.mockRejectedValue(failure(HttpStatus.TOO_MANY_REQUESTS, 86_400));
      await resolver.resolve(REQUEST);

      advance(599 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(1);

      advance(1 * SECOND);
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it('answers backend_not_connected when the login is gone, without caching it', async () => {
      api.playUrl.mockRejectedValueOnce(new BackendAuthError('x'));
      store.setBoard(new Map([[BRAND, [schedule('a', -5)]]]));

      const first = await resolver.resolve(REQUEST);
      api.playUrl.mockResolvedValue(answer());
      const second = await resolver.resolve(REQUEST);

      expect(first).toMatchObject({ ok: false, code: ResolveFailureCode.BACKEND_NOT_CONNECTED });
      expect(second).toMatchObject({ ok: true });
      expect(asked()).toEqual(['session-a', 'session-a']);
    });
  });

  describe('a cancelled resolve', () => {
    it('is not cached, does not count as a failure and logs no warning', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const controller = new AbortController();
      api.playUrl.mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      });

      const cancelled = await resolver.resolve({ ...REQUEST, signal: controller.signal });
      api.playUrl.mockResolvedValue(answer());
      const next = await resolver.resolve(REQUEST);

      expect(cancelled).toMatchObject({ ok: false, code: ResolveFailureCode.CANCELLED });
      expect(next).toMatchObject({ ok: true });
      expect(api.playUrl).toHaveBeenCalledTimes(2);
      expect(warn).not.toHaveBeenCalled();
    });

    it('asks the backend nothing when the budget was spent waiting for the brand lock', async () => {
      let release: (value: PlayUrlAnswer) => void = () => undefined;
      api.playUrl.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
      const first = resolver.resolve(REQUEST);
      await jest.advanceTimersByTimeAsync(0);

      const second = resolver.resolve({ ...REQUEST, timeoutMs: 1000 });
      await jest.advanceTimersByTimeAsync(2000);
      release(answer({ expiresAt: new Date(Date.now()).toISOString() }));
      await first;

      expect(await second).toMatchObject({ ok: false, code: ResolveFailureCode.BACKEND_ERROR });
      expect(api.playUrl).toHaveBeenCalledTimes(1);
    });

    it('does not ask the next session once the resolve was cancelled', async () => {
      store.setBoard(new Map([[BRAND, [schedule('now', -5)]]]));
      const controller = new AbortController();
      api.playUrl.mockImplementation(() => {
        controller.abort();
        return Promise.reject(new Error('aborted'));
      });

      const result = await resolver.resolve({ ...REQUEST, signal: controller.signal });

      expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.CANCELLED });
      expect(api.playUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache lifetime', () => {
    it.each([
      ['a logout or a new login', (): void => endLogin()],
      ['a refused refresh', (): void => void (session.connected = false)],
    ])('drops every cached answer after %s', async (_case, reset) => {
      api.playUrl.mockResolvedValue(answer());
      await resolver.resolve(REQUEST);
      reset();
      await resolver.resolve(REQUEST);
      session.connected = true;

      const result = await resolver.resolve(REQUEST);

      expect(result).toMatchObject({ ok: true });
      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['a logout or a new login', (): void => endLogin()],
      ['a refused refresh', (): void => void (session.connected = false)],
    ])('does not cache or record an answer that was in flight during %s', async (_case, reset) => {
      let release: (value: PlayUrlAnswer) => void = () => undefined;
      api.playUrl.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
      const pending = resolver.resolve(REQUEST);
      await jest.advanceTimersByTimeAsync(0);

      reset();
      release(answer());
      await pending;
      session.connected = true;

      expect(store.sessionOf(BRAND)).toBeNull();
      api.playUrl.mockResolvedValue(offline());
      await resolver.resolve(REQUEST);
      expect(api.playUrl).toHaveBeenCalledTimes(2);
    });

    it('keeps one brand serialized across a reset', async () => {
      let running = 0;
      let peak = 0;
      const slow = (): Promise<PlayUrlAnswer> => {
        running += 1;
        peak = Math.max(peak, running);
        return new Promise((resolve) =>
          setTimeout(() => {
            running -= 1;
            resolve(answer());
          }, SECOND),
        );
      };
      api.playUrl.mockImplementation(slow);
      const first = resolver.resolve(REQUEST);
      await jest.advanceTimersByTimeAsync(0);

      endLogin();
      const second = resolver.resolve(REQUEST);
      await jest.advanceTimersByTimeAsync(5 * SECOND);
      await Promise.all([first, second]);

      expect(api.playUrl).toHaveBeenCalledTimes(2);
      expect(peak).toBe(1);
    });

    it('logs the own message of a failure, never the play URL', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      api.playUrl.mockRejectedValue(new BackendAnswerError('play_url answer is not an object'));

      await resolver.resolve(REQUEST);

      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain('play_url answer is not an object');
      expect(line).not.toContain(PLAY_URL);
    });

    it('evicts entries long expired, so the cache stays bounded', async () => {
      await resolver.resolve({ ...REQUEST, brandId: 'gone' });
      advance(1300 * SECOND);

      await resolver.resolve(REQUEST);

      expect((resolver as unknown as { cache: Map<string, unknown> }).cache.size).toBe(1);
    });
  });

  describe('concurrent resolves of one brand', () => {
    it('share one backend call', async () => {
      let release: (value: PlayUrlAnswer) => void = () => undefined;
      api.playUrl.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));

      const results = Promise.all([
        resolver.resolve(REQUEST),
        resolver.resolve(REQUEST),
        resolver.resolve(REQUEST),
      ]);
      await jest.advanceTimersByTimeAsync(0);
      release(answer());

      const [a, b, c] = await results;
      expect(api.playUrl).toHaveBeenCalledTimes(1);
      expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    });

    it('do not wait for another brand', async () => {
      let release: (value: PlayUrlAnswer) => void = () => undefined;
      api.playUrl.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
      api.playUrl.mockResolvedValueOnce(answer());

      const slow = resolver.resolve(REQUEST);
      await jest.advanceTimersByTimeAsync(0);
      const other = await resolver.resolve({ ...REQUEST, brandId: 'brand-2' });

      expect(other).toMatchObject({ ok: true });
      release(answer());
      await slow;
    });
  });
});
