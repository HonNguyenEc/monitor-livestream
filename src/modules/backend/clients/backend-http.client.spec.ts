import { MAX_BACKEND_RESPONSE_BYTES } from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { BackendHttpClient } from './backend-http.client';

const URL = 'http://backend.test/api/v1/brands';

describe('BackendHttpClient', () => {
  const client = new BackendHttpClient();
  let fetchMock: jest.SpyInstance;

  const answer = (status: number, body: unknown, headers: Record<string, string> = {}): void => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    fetchMock.mockResolvedValue(new Response(text, { status, headers }));
  };

  const failure = async (): Promise<BackendRequestError> => {
    const error = await client.request('GET', URL).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BackendRequestError);
    return error as BackendRequestError;
  };

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('sends the JSON body and the bearer token, and returns the parsed answer', async () => {
    answer(200, [{ id: 1 }]);

    await expect(client.request('POST', URL, { body: { a: 1 }, token: 'tok' })).resolves.toEqual([
      { id: 1 },
    ]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: 'Bearer tok',
      },
    });
  });

  it('refuses a success body over the size cap, declared or streamed', async () => {
    const big = 'x'.repeat(MAX_BACKEND_RESPONSE_BYTES + 1);
    fetchMock.mockResolvedValueOnce(new Response(big, { status: 200 }));
    await expect(client.request('GET', URL)).rejects.toBeInstanceOf(BackendAnswerError);

    fetchMock.mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'content-length': String(MAX_BACKEND_RESPONSE_BYTES + 1) },
      }),
    );
    await expect(client.request('GET', URL)).rejects.toBeInstanceOf(BackendAnswerError);
  });

  it('keeps the status of an error answer whose body is over the size cap', async () => {
    fetchMock.mockResolvedValue(
      new Response('x'.repeat(MAX_BACKEND_RESPONSE_BYTES + 1), { status: 503 }),
    );

    expect(await failure()).toMatchObject({ status: 503, remoteMessage: '' });
  });

  it.each([
    ['an empty', ''],
    ['a non-JSON', '<html></html>'],
  ])('returns undefined for %s success body', async (_case, body) => {
    answer(200, body);
    await expect(client.request('GET', URL)).resolves.toBeUndefined();
  });

  it('sends a plain GET without body headers, never follows redirects and sets a timeout', async () => {
    answer(200, {});

    await client.request('GET', URL);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ accept: 'application/json' });
    expect(init.body).toBeUndefined();
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a redirect as a failure with its status', async () => {
    answer(307, '', { location: 'http://elsewhere.test/' });
    expect((await failure()).status).toBe(307);
  });

  it('reports a body that cannot be read as no answer', async () => {
    const body = new ReadableStream({
      start: (controller) => controller.error(new TypeError('terminated')),
    });
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));

    expect((await failure()).status).toBe(0);
  });

  it.each([
    ['a string detail', { detail: 'Account locked' }, 'Account locked'],
    ['an object detail', { detail: { message: 'Brand missing' } }, 'Brand missing'],
    ['validation errors', { detail: [{ msg: 'a' }, { msg: 'b' }] }, 'a; b'],
    ['a message field', { message: 'Busy' }, 'Busy'],
    ['no JSON', 'oops', ''],
  ])('reads the backend message from %s', async (_case, body, message) => {
    answer(403, body);

    const error = await failure();
    expect(error.status).toBe(403);
    expect(error.remoteMessage).toBe(message);
  });

  it('masks URLs and caps the backend message', async () => {
    answer(500, { detail: `see https://internal.host/x ${'y'.repeat(400)}` });

    const { remoteMessage } = await failure();
    expect(remoteMessage).not.toContain('internal.host');
    expect(remoteMessage).toHaveLength(300);
  });

  it.each([
    ['120', 120],
    ['Wed, 21 Oct 2026 07:28:00 GMT', null],
  ])('reads Retry-After %p as %p', async (header, seconds) => {
    answer(429, {}, { 'retry-after': header });
    expect((await failure()).retryAfterSeconds).toBe(seconds);
  });

  it('reports no answer as status 0 with the cause', async () => {
    const cause = new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') });
    fetchMock.mockRejectedValue(cause);

    const error = await failure();
    expect(error.status).toBe(0);
    expect(error.cause).toBe(cause);
  });
});
