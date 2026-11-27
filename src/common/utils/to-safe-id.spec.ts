import { toSafeId } from './to-safe-id';

describe('toSafeId', () => {
  it.each([
    [5, 5],
    ['42', 42],
  ])('accepts %p', (input, expected) => {
    expect(toSafeId(input)).toBe(expected);
  });

  it.each([
    [0],
    [-5],
    [1.5],
    ['abc'],
    [' 7 '],
    [true],
    [[5]],
    [null],
    [undefined],
    ['9007199254740993'],
    [9007199254740993],
  ])('rejects %p', (input) => {
    expect(toSafeId(input)).toBeNull();
  });
});
