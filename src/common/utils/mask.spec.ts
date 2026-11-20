import { maskEmail, maskId, maskUrl } from './mask';

describe('maskEmail', () => {
  it.each([
    ['admin@example.com', 'ad•••@example.com'],
    ['bob@example.com', 'b•••@example.com'],
    ['admin', 'ad•••'],
    ['@example.com', ''],
    ['', ''],
  ])('masks %p as %p', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });
});

describe('maskUrl', () => {
  it.each([
    ['https://auto.example.vn', 'https://aut•••.example.vn'],
    ['https://api.live.example.vn/api/v1', 'https://live.example.vn'],
    ['http://backend:8000', 'http://bac•••'],
    ['http://10.1.2.3:8000', 'http://10.•••.•••.3'],
    ['http://localhost:8000', 'http://localhost'],
    ['http://127.0.0.1:8000', 'http://127.0.0.1'],
    ['http://[::1]:8000', 'http://[::1]'],
    ['not a url', ''],
    ['', ''],
  ])('masks %p as %p', (url, masked) => {
    expect(maskUrl(url)).toBe(masked);
  });
});

describe('maskId', () => {
  it.each([
    ['1234567', '•••4567'],
    ['12345', '•••2345'],
    ['1234', '1234'],
    ['', ''],
  ])('masks %p as %p', (id, masked) => {
    expect(maskId(id)).toBe(masked);
  });
});
