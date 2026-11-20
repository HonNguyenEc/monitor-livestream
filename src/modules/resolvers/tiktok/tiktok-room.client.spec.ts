import { TikTokRoomClient } from './tiktok-room.client';
import { TIKTOK_HEADERS } from './tiktok.constants';

const TIMEOUT = 1234;

describe('TikTokRoomClient', () => {
  afterEach(() => jest.restoreAllMocks());

  function stubFetch(): jest.SpyInstance {
    return jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{"statusCode":0}')));
  }

  it('requests the room API with the encoded username and the browser headers', async () => {
    const spy = stubFetch();
    const result = await new TikTokRoomClient().fetchRoom('a b/c?d', TIMEOUT);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=a%20b%2Fc%3Fd',
    );
    expect(init.headers).toEqual(TIKTOK_HEADERS);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({ status: 200, data: { statusCode: 0 } });
  });

  it('lets a network error propagate for the resolver to handle', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(new TikTokRoomClient().fetchRoom('x', TIMEOUT)).rejects.toThrow('fetch failed');
  });
});
