import { Logger } from '@nestjs/common';

import { DetectionControl } from './detection-control';

describe('DetectionControl', () => {
  let control: DetectionControl;

  beforeEach(() => {
    control = new DetectionControl();
  });

  it('does nothing until a handler is registered', async () => {
    await expect(control.stop('a')).resolves.toBeUndefined();
  });

  it('refuses a second handler, which would silently replace the first', () => {
    control.register(jest.fn());

    expect(() => control.register(jest.fn())).toThrow('already registered');
  });

  it('hands the key to the registered handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    control.register(handler);

    await control.stop('tiktok_a');

    expect(handler).toHaveBeenCalledWith('tiktok_a');
  });

  it('never throws, so a saved delete or rename is not undone by a failing stop', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    control.register(() => Promise.reject(new Error('boom')));

    await expect(control.stop('a')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cannot stop the job of a'));
    warn.mockRestore();
  });
});
