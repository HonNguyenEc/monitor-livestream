import { DEFAULT_ALLOWED_ORIGINS, DEFAULT_QC_PORT } from '../common/constants/app.constants';
import { appConfig } from './app.config';

describe('appConfig', () => {
  const original = { port: process.env.QC_PORT, origins: process.env.ALLOWED_ORIGINS };

  const restore = (name: string, value: string | undefined): void => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  afterEach(() => {
    restore('QC_PORT', original.port);
    restore('ALLOWED_ORIGINS', original.origins);
  });

  it('splits, trims and normalises ALLOWED_ORIGINS', () => {
    process.env.ALLOWED_ORIGINS = ' http://a.test , HTTP://B.test/,';

    expect(appConfig().allowedOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it.each([undefined, '', ' , '])('falls back to the default origins for %p', (value) => {
    restore('ALLOWED_ORIGINS', value);

    expect(appConfig().allowedOrigins).toEqual([DEFAULT_ALLOWED_ORIGINS]);
  });

  it.each([undefined, '', '  '])('falls back to the default port for %p', (value) => {
    restore('QC_PORT', value);

    expect(appConfig().port).toBe(DEFAULT_QC_PORT);
  });

  it.each([
    ['8766', 8766],
    [' 8766 ', 8766],
    ['1', 1],
    ['65535', 65535],
  ])('reads the valid port %p', (value, port) => {
    process.env.QC_PORT = value;

    expect(appConfig().port).toBe(port);
  });

  it.each(['abc', '0', '65536', '-1', '8765.5', '1e3', '0x1F'])('rejects %p', (value) => {
    process.env.QC_PORT = value;

    expect(() => appConfig()).toThrow(/QC_PORT must be an integer/);
  });
});
