import { localDate } from './local-date';

describe('localDate', () => {
  it('formats the local calendar day with zero padding', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59, 59).getTime())).toBe('2026-01-05');
    expect(localDate(new Date(2026, 11, 31, 0, 0, 0).getTime())).toBe('2026-12-31');
  });
});
