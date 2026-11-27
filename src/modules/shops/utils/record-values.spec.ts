import { optionalInteger, optionalString } from './record-values';

describe('optionalInteger', () => {
  it.each([
    [5, 5],
    ['777', 777],
    [-3, -3],
    [1.5, undefined],
    ['-3', undefined],
    ['1.5', undefined],
    ['99999999999999999999', undefined],
    [2 ** 60, undefined],
    ['', undefined],
    [true, undefined],
    [null, undefined],
    [[], undefined],
  ])('%j reads as %s', (value, expected) => {
    expect(optionalInteger(value)).toBe(expected);
  });
});

describe('optionalString', () => {
  it.each([
    ['a', 'a'],
    [12, '12'],
    ['', undefined],
    [null, undefined],
    [true, undefined],
  ])('%j reads as %s', (value, expected) => {
    expect(optionalString(value)).toBe(expected);
  });
});
