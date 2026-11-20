import { BackendAnswerError } from '../errors/backend-answer.error';
import { readBoard, readBrands, readPlayUrl } from './backend-answers';

describe('readBrands', () => {
  it('keeps only the brands connected to the Shopee Open API, naming a nameless one by its id', () => {
    const answer = [
      { id: 'b1', name: 'One', is_connect_shopee: true },
      { id: 'b2', name: 'Two', is_connect_shopee: false },
      { id: 'b3', name: '', is_connect_shopee: true },
      { id: 'b4', name: 'Four' },
      { id: 7, name: 'Seven', is_connect_shopee: true },
    ];

    expect(readBrands(answer)).toEqual([
      { id: 'b1', name: 'One' },
      { id: 'b3', name: 'b3' },
      { id: '7', name: 'Seven' },
    ]);
  });

  it.each([
    ['an object', {}],
    ['a list of strings', ['x']],
    ['a connected brand without an id', [{ is_connect_shopee: true }]],
  ])('rejects %s', (_case, answer) => {
    expect(() => readBrands(answer)).toThrow(BackendAnswerError);
  });
});

describe('readBoard', () => {
  const item = (brand: string, schedule: string, at: string): Record<string, unknown> => ({
    brand_id: brand,
    schedule_id: schedule,
    platform: 'shopee',
    session_id: '99887766',
    scheduled_at: at,
    expected_end_at: at,
    status: 'waiting',
    status_label: 'Waiting',
    schedule_status: 'scheduled',
    account_id: 'secret-account',
  });

  it('groups the rows by brand, sorted by start, without the account id', () => {
    const board = readBoard({
      items: [
        item('b1', 'late', '2026-01-15T14:00'),
        item('b2', 'x', '2026-01-15T09:00'),
        item('b1', 'early', '2026-01-15T08:00'),
      ],
    });

    expect([...board.keys()]).toEqual(['b1', 'b2']);
    expect(board.get('b1')?.map((row) => row.scheduleId)).toEqual(['early', 'late']);
    expect(board.get('b1')?.[0]).toEqual({
      scheduleId: 'early',
      platform: 'shopee',
      sessionId: '99887766',
      scheduledAt: '2026-01-15T08:00',
      expectedEndAt: '2026-01-15T08:00',
      status: 'waiting',
      statusLabel: 'Waiting',
      scheduleStatus: 'scheduled',
    });
  });

  it('groups a row with a numeric brand id under the same text id a brand gets', () => {
    const board = readBoard({ items: [{ ...item('x', 's1', 'a'), brand_id: 7 }] });

    expect([...board.keys()]).toEqual(['7']);
    expect(readBrands([{ id: 7, is_connect_shopee: true }])[0].id).toBe('7');
  });

  it('drops rows without a brand id or a schedule id', () => {
    const board = readBoard({
      items: [
        item('', 's1', 'a'),
        { ...item('b1', 's1', 'a'), brand_id: null },
        item('b1', '', 'a'),
        { ...item('b1', 's2', 'a'), session_id: '' },
      ],
    });

    expect(board.get('b1')?.map((row) => row.scheduleId)).toEqual(['s2']);
    expect(board.size).toBe(1);
  });

  it.each([[{}], [{ items: null }]])('reads %j as an empty board', (answer) => {
    expect(readBoard(answer).size).toBe(0);
  });

  it.each([[[]], [{ items: 'x' }], [{ items: [1] }]])('rejects %j', (answer) => {
    expect(() => readBoard(answer)).toThrow(BackendAnswerError);
  });
});

describe('readPlayUrl', () => {
  it('reads the documented fields', () => {
    expect(
      readPlayUrl({
        brand_id: 'b1',
        session_id: '123',
        shopee_status: 1,
        is_live: true,
        title: 'T',
        share_url: 'https://s',
        play_url: 'https://p',
        expires_at: '2026-01-15T10:00:00Z',
      }),
    ).toEqual({
      sessionId: '123',
      shopeeStatus: 1,
      isLive: true,
      title: 'T',
      shareUrl: 'https://s',
      playUrl: 'https://p',
      expiresAt: '2026-01-15T10:00:00Z',
    });
  });

  it('falls back to empty values and rejects a non-object', () => {
    expect(readPlayUrl({})).toMatchObject({ isLive: false, playUrl: '', shopeeStatus: null });
    expect(() => readPlayUrl([])).toThrow(BackendAnswerError);
  });
});
