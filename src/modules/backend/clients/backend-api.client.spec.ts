import { AuthenticatedBackendTransport } from './authenticated-backend.transport';
import { BackendApiClient } from './backend-api.client';

describe('BackendApiClient', () => {
  const get = jest.fn();
  const client = new BackendApiClient({ get } as unknown as AuthenticatedBackendTransport);

  beforeEach(() => get.mockReset());

  it('reads the brands the account can see', async () => {
    get.mockResolvedValue([{ id: 'b1', name: 'One', is_connect_shopee: true }]);

    await expect(client.brands()).resolves.toEqual([{ id: 'b1', name: 'One' }]);
    expect(get).toHaveBeenCalledWith('/brands');
  });

  it('reads the board of a day, as the date query of the board endpoint', async () => {
    get.mockResolvedValue({ items: [] });

    await client.board('2026-01-15');

    expect(get).toHaveBeenCalledWith('/live-monitor/board', { date: '2026-01-15' });
  });

  it('asks for a session of a brand, escaping the brand id, with the timeout', async () => {
    get.mockResolvedValue({ is_live: true, play_url: 'https://p' });

    const { signal } = new AbortController();

    const answer = await client.playUrl('a/b', '123', 5000, signal);

    expect(get).toHaveBeenCalledWith(
      '/brands/a%2Fb/livestream/play_url',
      { session_id: '123' },
      5000,
      signal,
    );
    expect(answer.isLive).toBe(true);
  });
});
