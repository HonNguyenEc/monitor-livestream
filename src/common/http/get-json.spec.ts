import { getJson } from './get-json';

const URL = 'https://api.example/x';
const HEADERS = { accept: 'application/json' };
const TIMEOUT = 5000;

function stubFetch(body: string, status = 200): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }));
}

describe('getJson', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the status and the parsed object', async () => {
    stubFetch('{"a":1}', 403);
    await expect(getJson(URL, HEADERS, TIMEOUT)).resolves.toEqual({ status: 403, data: { a: 1 } });
  });

  it.each([
    ['an HTML body', '<html>blocked</html>'],
    ['a JSON array', '[1,2]'],
    ['null', 'null'],
    ['a scalar', '5'],
    ['an empty body', ''],
  ])('flags %s as an invalid body and keeps the status', async (_name, body) => {
    stubFetch(body, 502);
    await expect(getJson(URL, HEADERS, TIMEOUT)).resolves.toEqual({
      status: 502,
      data: {},
      invalidBody: true,
    });
  });

  it('flags a body over the size cap as invalid without reading it all', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }));
    await expect(getJson(URL, HEADERS, TIMEOUT)).resolves.toEqual({
      status: 200,
      data: {},
      invalidBody: true,
    });
    expect(pulled).toBeLessThan(10);
  });

  it('flags a declared content-length over the cap as invalid', async () => {
    const response = new Response('{}', { headers: { 'content-length': '99999999' } });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(getJson(URL, HEADERS, TIMEOUT)).resolves.toMatchObject({ invalidBody: true });
  });

  it('decodes multi-byte text split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"t":"Việt"}');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 9));
        controller.enqueue(bytes.slice(9));
        controller.close();
      },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    await expect(getJson(URL, HEADERS, TIMEOUT)).resolves.toEqual({
      status: 200,
      data: { t: 'Việt' },
    });
  });

  it('passes the headers and a timeout signal to fetch', async () => {
    const spy = stubFetch('{}');
    await getJson(URL, HEADERS, TIMEOUT);
    const [calledUrl, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(URL);
    expect(init.headers).toEqual(HEADERS);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the request once the timeout elapses', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    await expect(getJson(URL, HEADERS, 20)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('lets a network failure propagate', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(getJson(URL, HEADERS, TIMEOUT)).rejects.toThrow('fetch failed');
  });
});

describe('getJson cancellation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes a signal that aborts with the caller signal', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const controller = new AbortController();

    await getJson(URL, HEADERS, TIMEOUT, controller.signal);
    const { signal } = fetchSpy.mock.calls[0][1] as RequestInit;

    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });

  it('rejects when the caller signal is already aborted', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      return signal.aborted ? Promise.reject(signal.reason) : Promise.resolve(new Response('{}'));
    });

    await expect(getJson(URL, HEADERS, TIMEOUT, AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
