import { knowsMediaControls } from './mpv-version';

describe('knowsMediaControls', () => {
  it.each([
    ['mpv v0.42.0-3-g902818753 Copyright', true],
    ['mpv 0.43.1 Copyright', true],
    ['mpv v1.0.0', true],
    ['mpv v0.41.9', false],
    ['mpv 0.37.0-dirty', false],
    ['mpv-git-2024', false],
    ['', false],
    ['not a player', false],
  ])('%s -> %s', (text, expected) => {
    expect(knowsMediaControls(text)).toBe(expected);
  });
});
