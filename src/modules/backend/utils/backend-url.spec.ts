import { apiUrl, normalizeBaseUrl } from './backend-url';

describe('normalizeBaseUrl', () => {
  it.each([
    ['http://localhost:8000', 'http://localhost:8000'],
    [' https://api.example.vn/ ', 'https://api.example.vn'],
    ['https://api.example.vn/api/v1/', 'https://api.example.vn'],
    ['HTTPS://API.example.vn', 'https://api.example.vn'],
    ['https://example.vn/live/', 'https://example.vn/live'],
  ])('reads %p as %p', (raw, url) => {
    expect(normalizeBaseUrl(raw)).toBe(url);
  });

  it.each([
    'localhost:8000',
    'ftp://example.vn',
    'http://',
    '',
    'https://user:pw@example.vn',
    'https://example.vn/?x=1',
    'https://example.vn/#top',
  ])('refuses %p', (raw) => {
    expect(normalizeBaseUrl(raw)).toBeNull();
  });
});

describe('apiUrl', () => {
  it('adds the API prefix and drops empty query values', () => {
    expect(apiUrl('http://b', '/brands/12/x', { session_id: '', date: '2026-01-01' })).toBe(
      'http://b/api/v1/brands/12/x?date=2026-01-01',
    );
  });
});
