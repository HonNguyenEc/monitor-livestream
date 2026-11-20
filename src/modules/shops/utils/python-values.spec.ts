import { isPythonTruthy, pythonStr } from './python-values';

describe('isPythonTruthy', () => {
  it.each([
    [null, false],
    [undefined, false],
    [false, false],
    [0, false],
    ['', false],
    [[], false],
    [{}, false],
    [true, true],
    [1, true],
    ['0', true],
    [[0], true],
    [{ a: 1 }, true],
  ])('%j is %s', (value, expected) => {
    expect(isPythonTruthy(value)).toBe(expected);
  });
});

describe('pythonStr', () => {
  it.each([
    [null, 'None'],
    [undefined, 'None'],
    [true, 'True'],
    [false, 'False'],
    [61924024, '61924024'],
    ['abc', 'abc'],
  ])('%j prints as %s', (value, expected) => {
    expect(pythonStr(value)).toBe(expected);
  });
});
