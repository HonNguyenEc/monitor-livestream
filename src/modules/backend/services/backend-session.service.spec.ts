import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpStatus, Logger } from '@nestjs/common';

import { DomainException } from '../../../common/exceptions/domain.exception';
import { AuthenticatedBackendTransport } from '../clients/authenticated-backend.transport';
import { BackendHttpClient } from '../clients/backend-http.client';
import { toBackendConfig } from '../config/backend.config';
import { NO_HTTP_STATUS, SESSION_FILE } from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendAuthError } from '../errors/backend-auth.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { BackendSession } from '../models/backend-session.model';
import { BackendSessionRepository } from '../repositories/backend-session.repository';
import { BackendSessionService } from './backend-session.service';

const BASE_URL = 'http://backend.test';
const LOGIN_URL = `${BASE_URL}/api/v1/auth/login`;
const REFRESH_URL = `${BASE_URL}/api/v1/auth/refresh`;
const BRANDS_URL = `${BASE_URL}/api/v1/brands`;
const USER = { id: 7, email: 'admin@example.com', name: 'Admin', role: 'admin' };
const LOGIN_ANSWER = { access_token: 'a1', refresh_token: 'r1', user: { ...USER, shop_name: '' } };
const STORED = { base_url: BASE_URL, access_token: 'a1', refresh_token: 'r1', user: USER };
const RENEWED = { access_token: 'a2', refresh_token: 'r2' };

type Answer = unknown;

interface Routes {
  login?: () => Promise<unknown>;
  refresh?: () => Promise<unknown>;
  /** Answer of a GET sent with `token`; defaults to 401 for the stored token a1, else [token]. */
  get?: (token: string) => Promise<unknown>;
}

const unauthorized = (): BackendRequestError =>
  new BackendRequestError('x', HttpStatus.UNAUTHORIZED);

const settle = (answer: Answer): Promise<unknown> =>
  answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);

/** A promise plus the function that settles it later. */
function deferred(): { promise: Promise<unknown>; settle: (answer: Answer) => void } {
  let settleLater: (answer: Answer) => void = () => undefined;
  const promise = new Promise((resolve, reject) => {
    settleLater = (answer) => (answer instanceof Error ? reject(answer) : resolve(answer));
  });
  return { promise, settle: settleLater };
}

const tick = (): Promise<void> => new Promise(setImmediate);

async function waitUntil(check: () => Promise<void>): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await check();
    } catch (error) {
      if (attempt >= 100) throw error;
      await new Promise((done) => setTimeout(done, 20));
    }
  }
}

describe('BackendSessionService with its transport', () => {
  let dir: string;
  let request: jest.Mock;
  let service: BackendSessionService;
  let transport: AuthenticatedBackendTransport;
  let repository: BackendSessionRepository;

  const sessionFile = (): string => join(dir, SESSION_FILE);
  const storedSession = async (): Promise<unknown> =>
    JSON.parse(await readFile(sessionFile(), 'utf8'));
  const expectNoSessionFile = (): Promise<void> =>
    expect(readFile(sessionFile())).rejects.toMatchObject({ code: 'ENOENT' });
  const refreshCalls = (): unknown[][] =>
    request.mock.calls.filter(([, url]) => url === REFRESH_URL);

  const route = (routes: Routes): void => {
    request.mockImplementation((_method: string, url: string, options: { token?: string }) => {
      if (url === LOGIN_URL) return (routes.login ?? (() => settle(LOGIN_ANSWER)))();
      if (url === REFRESH_URL) return (routes.refresh ?? (() => settle(RENEWED)))();
      const token = options.token ?? '';
      if (routes.get) return routes.get(token);
      return settle(token === STORED.access_token ? unauthorized() : [token]);
    });
  };

  const start = async (url = BASE_URL): Promise<BackendSessionService> => {
    const http = { request } as unknown as BackendHttpClient;
    repository = new BackendSessionRepository(dir);
    transport = new AuthenticatedBackendTransport(http, repository);
    service = new BackendSessionService(toBackendConfig(url), http, repository, transport);
    await service.onModuleInit();
    return service;
  };

  const startLoggedIn = async (): Promise<BackendSessionService> => {
    await writeFile(sessionFile(), JSON.stringify(STORED));
    return start();
  };

  /** Settles once the next write of the session file is over; reading the file meanwhile would hold it open and make Windows refuse the rename. */
  const nextStore = (): Promise<void> => {
    const original = repository.storeQuietly.bind(repository);
    return new Promise((done) => {
      jest.spyOn(repository, 'storeQuietly').mockImplementationOnce(async (session) => {
        await original(session);
        done();
      });
    });
  };

  const loginError = async (): Promise<DomainException> => {
    const error = await service.login(USER.email, 'pw').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainException);
    expect((error as DomainException).code).toBe('BACKEND_LOGIN_FAILED');
    return error as DomainException;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'live-qc-backend-'));
    request = jest.fn();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  describe('login', () => {
    it('stores the session of an admin and never the password', async () => {
      await start(`${BASE_URL}/api/v1/`);
      request.mockResolvedValue(LOGIN_ANSWER);

      await service.login(USER.email, 'pw');

      expect(request).toHaveBeenCalledWith('POST', LOGIN_URL, {
        body: { email: USER.email, password: 'pw' },
      });
      expect(service.connected).toBe(true);
      expect(service.user).toEqual(USER);
      expect(await storedSession()).toEqual(STORED);
    });

    it.each([
      ['wrong credentials', unauthorized(), 'Sai email hoặc mật khẩu.'],
      ['no answer', new BackendRequestError('x', NO_HTTP_STATUS), 'Không kết nối được backend'],
      ['a locked account', new BackendRequestError('x', 403, 'Locked'), '(HTTP 403): Locked'],
    ])('reports %s', async (_case, error, text) => {
      await start();
      request.mockRejectedValue(error);

      expect((await loginError()).message).toContain(text);
      expect(service.connected).toBe(false);
    });

    it.each([
      ['a role that is not admin', { ...LOGIN_ANSWER, user: { ...USER, role: 'shop' } }],
      ['an answer without tokens', { user: USER }],
    ])('refuses %s and stores nothing', async (_case, answer) => {
      await start();
      request.mockResolvedValue(answer);

      await loginError();
      await expectNoSessionFile();
    });

    it('refuses an AUTO_LIVES_BACKEND_URL that is not http(s) without calling out', async () => {
      await start('backend.test');

      const { message } = await loginError();

      expect(message).toContain('quản trị viên');
      expect(message).not.toContain('.env');
      expect(request).not.toHaveBeenCalled();
    });

    it('passes on an unexpected error from the login request', async () => {
      await start();
      request.mockRejectedValue(new TypeError('bug'));

      await expect(service.login(USER.email, 'pw')).rejects.toBeInstanceOf(TypeError);
    });

    it('keeps a login whose session file cannot be saved', async () => {
      await start();
      request.mockResolvedValue(LOGIN_ANSWER);
      jest.spyOn(repository, 'store').mockRejectedValue(new Error('EPERM'));

      await service.login(USER.email, 'pw');

      expect(service.connected).toBe(true);
    });
  });

  describe('stored session', () => {
    it('is used when it belongs to the configured backend', async () => {
      await startLoggedIn();
      expect(service.connected).toBe(true);
    });

    it('is ignored, and logged once with masked URLs, for another backend', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      await writeFile(
        sessionFile(),
        JSON.stringify({ ...STORED, base_url: 'http://other-backend.example' }),
      );
      await start();
      expect(service.connected).toBe(false);
      const lines = log.mock.calls
        .map((call) => String(call[0]))
        .filter((l) => l.includes('ignored'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain('other-backend');
    });

    it.each([
      ['without a refresh token', JSON.stringify({ ...STORED, refresh_token: '' })],
      ['that is not JSON', '{'],
    ])('is ignored %s', async (_case, text) => {
      await writeFile(sessionFile(), text);
      await start();
      expect(service.connected).toBe(false);
    });
  });

  describe('logout', () => {
    it('deletes the stored session', async () => {
      await startLoggedIn();

      await service.logout();

      expect(service.connected).toBe(false);
      await expectNoSessionFile();
    });

    it('stays logged in and fails when the file cannot be deleted', async () => {
      await startLoggedIn();
      jest.spyOn(repository, 'store').mockRejectedValue(new Error('EBUSY'));

      await expect(service.logout()).rejects.toThrow('EBUSY');

      expect(service.connected).toBe(true);
    });
  });

  describe('epoch', () => {
    it('changes on a login, a logout and a refused refresh', async () => {
      await start();
      request.mockResolvedValue(LOGIN_ANSWER);
      const seen = [transport.epoch];

      await service.login(USER.email, 'pw');
      seen.push(transport.epoch);
      await service.login(USER.email, 'pw');
      seen.push(transport.epoch);
      await service.logout();
      seen.push(transport.epoch);
      await service.login(USER.email, 'pw');
      seen.push(transport.epoch);
      route({ refresh: () => settle(unauthorized()) });
      await transport.get('/brands').catch(() => undefined);
      seen.push(transport.epoch);

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
    });

    it('stays the same when the tokens rotate', async () => {
      await startLoggedIn();
      route({});
      const before = transport.epoch;

      await transport.get('/brands');

      expect(await storedSession()).toMatchObject(RENEWED);
      expect(transport.epoch).toBe(before);
    });
  });

  describe('one deadline for a request, its refresh and its retry', () => {
    it('gives the first try and the retry the same signal', async () => {
      await startLoggedIn();
      route({});

      await transport.get('/brands', {}, 5000);

      const gets = request.mock.calls.filter(([method]) => method === 'GET');
      expect(gets).toHaveLength(2);
      expect(gets[0][2].signal).toBe(gets[1][2].signal);
    });

    it('stops waiting for the refresh when the caller aborts, while the refresh goes on for others', async () => {
      await startLoggedIn();
      const refresh = deferred();
      let refreshAsked = false;
      route({
        refresh: () => {
          refreshAsked = true;
          return refresh.promise;
        },
      });
      const controller = new AbortController();

      const pending = transport
        .get('/brands', {}, 5000, controller.signal)
        .catch((e: unknown) => e);
      await waitUntil(async () => expect(refreshAsked).toBe(true));
      controller.abort(new Error('stopped'));

      expect(await pending).toMatchObject({ status: NO_HTTP_STATUS, cause: new Error('stopped') });
      const written = nextStore();
      refresh.settle(RENEWED);
      await written;

      expect(await storedSession()).toMatchObject(RENEWED);
    });

    it('records the epoch a refused refresh ended even when a login lands while the file is cleared', async () => {
      await startLoggedIn();
      route({ refresh: () => settle(unauthorized()) });
      const before = transport.epoch;
      const clearing = deferred();
      jest.spyOn(repository, 'storeQuietly').mockImplementation(() => clearing.promise as never);

      const pending = transport.get('/brands').catch((e: unknown) => e);
      await tick();
      transport.adopt({ ...STORED, access_token: 'a9' });
      clearing.settle(undefined);
      const error = (await pending) as BackendAuthError;

      expect(error.endedEpoch).toBe(before + 1);
      expect(transport.epoch).toBe(before + 2);
    });

    it('gives the request, its refresh wait and its retry the timeout it was asked for', async () => {
      await startLoggedIn();
      request.mockImplementation(
        (_method: string, _url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () => reject(new Error('timed out'))),
          ),
      );

      await expect(transport.get('/brands', {}, 30)).rejects.toThrow('timed out');
    });

    it('honours a budget above the 25 s default instead of capping each request', async () => {
      await startLoggedIn();
      request.mockResolvedValue([]);

      await transport.get('/brands', {}, 90_000);

      const { signal } = request.mock.calls[0][2];
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });

    it('passes on a failure of the refresh wait that is not an abort, unchanged', async () => {
      await startLoggedIn();
      route({ refresh: () => settle(new BackendAnswerError('odd answer')) });

      const error = await transport.get('/brands', {}, 5000).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BackendAnswerError);
    });

    it('reports a refresh wait the budget cut short as a backend that did not answer', async () => {
      await startLoggedIn();
      route({ refresh: () => new Promise(() => undefined) });

      const error = await transport.get('/brands', {}, 50).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BackendRequestError);
      expect(error).toMatchObject({ status: NO_HTTP_STATUS });
    });
  });

  describe('get', () => {
    it('sends the query, the timeout and the access token, and counts the call', async () => {
      await startLoggedIn();
      request.mockResolvedValue([]);

      await expect(transport.get('/brands', { a: '1', b: '' }, 5000)).resolves.toEqual([]);

      expect(request).toHaveBeenCalledWith('GET', `${BRANDS_URL}?a=1`, {
        token: 'a1',
        signal: expect.any(AbortSignal),
      });
      expect(service.recentCallCount()).toBe(1);
    });

    it('throws BackendAuthError without a login', async () => {
      await start();
      await expect(transport.get('/brands')).rejects.toBeInstanceOf(BackendAuthError);
    });

    it('refreshes once on a 401, saves the new pair and retries', async () => {
      await startLoggedIn();
      route({});

      const results = await Promise.all([transport.get('/brands'), transport.get('/brands')]);

      expect(results).toEqual([['a2'], ['a2']]);
      expect(refreshCalls()).toEqual([['POST', REFRESH_URL, { body: { refresh_token: 'r1' } }]]);
      expect(await storedSession()).toMatchObject(RENEWED);
      expect(service.recentCallCount()).toBe(4);
    });

    it('uses the refreshed token when the session file cannot be saved', async () => {
      await startLoggedIn();
      jest.spyOn(repository, 'store').mockRejectedValue(new Error('EPERM'));
      route({});

      await expect(transport.get('/brands')).resolves.toEqual(['a2']);
    });

    it('logs out when the refresh token is rejected', async () => {
      await startLoggedIn();
      route({ refresh: () => settle(unauthorized()) });

      await expect(transport.get('/brands')).rejects.toBeInstanceOf(BackendAuthError);

      expect(service.connected).toBe(false);
      await expectNoSessionFile();
    });

    it.each([400, 403, 503])('keeps the login when the refresh answers %p', async (status) => {
      await startLoggedIn();
      route({ refresh: () => settle(new BackendRequestError('x', status)) });

      await expect(transport.get('/brands')).rejects.toMatchObject({ status });
      expect(service.connected).toBe(true);
    });

    it('keeps the login when the refresh answer has no token pair', async () => {
      await startLoggedIn();
      route({ refresh: () => settle({}) });

      await expect(transport.get('/brands')).rejects.toBeInstanceOf(BackendAnswerError);
      expect(service.connected).toBe(true);
    });

    it('passes on a second 401 without refreshing again', async () => {
      await startLoggedIn();
      route({ get: () => settle(unauthorized()) });

      const error = await transport.get('/brands').catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BackendRequestError);
      expect(error).not.toBeInstanceOf(BackendAuthError);
      expect(refreshCalls()).toHaveLength(1);
    });

    it('does not refresh again for a 401 that arrives after the refresh finished', async () => {
      await startLoggedIn();
      const slowGet = deferred();
      let staleGets = 0;
      route({
        get: (token) => {
          if (token !== STORED.access_token) return settle([token]);
          staleGets += 1;
          return staleGets === 1 ? settle(unauthorized()) : slowGet.promise;
        },
      });

      const first = transport.get('/brands');
      const slow = transport.get('/brands');
      await expect(first).resolves.toEqual(['a2']);
      slowGet.settle(unauthorized());

      await expect(slow).resolves.toEqual(['a2']);
      expect(staleGets).toBe(2);
      expect(refreshCalls()).toHaveLength(1);
    });

    it.each([
      ['answers', RENEWED],
      ['is refused', unauthorized()],
    ])('retries with a new login made while the refresh ran and %s', async (_case, outcome) => {
      await startLoggedIn();
      const refresh = deferred();
      route({
        login: () => settle({ ...LOGIN_ANSWER, access_token: 'a9' }),
        refresh: () => refresh.promise,
      });

      const pending = transport.get('/brands');
      await tick();
      await service.login(USER.email, 'pw');
      refresh.settle(outcome);

      await expect(pending).resolves.toEqual(['a9']);
      expect(service.connected).toBe(true);
      expect(await storedSession()).toMatchObject({ access_token: 'a9' });
    });

    it.each([
      ['after the file is deleted', false],
      ['while the file is being deleted', true],
    ])('does not bring back a session whose refresh answers %s', async (_case, slowClear) => {
      await startLoggedIn();
      const clearing = deferred();
      if (slowClear) {
        const store = repository.store.bind(repository);
        jest
          .spyOn(repository, 'store')
          .mockImplementation((next: BackendSession | null) =>
            clearing.promise.then(() => store(next)),
          );
      }
      const refresh = deferred();
      route({ refresh: () => refresh.promise });

      const pending = transport.get('/brands').catch((caught: unknown) => caught);
      await tick();
      const logout = service.logout();
      refresh.settle(RENEWED);
      await tick();
      clearing.settle(undefined);
      await logout;

      expect(await pending).toBeInstanceOf(BackendAuthError);
      expect(service.connected).toBe(false);
      await expectNoSessionFile();
    });
  });
});
