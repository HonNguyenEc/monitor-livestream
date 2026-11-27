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

  describe('rename', () => {
    it('stops the job of the old key, then tells every listener', async () => {
      const order: string[] = [];
      control.register(async (key) => {
        order.push('stop ' + key);
      });
      control.onRename((oldKey, newKey) => order.push('moved ' + oldKey + ' ' + newKey));
      control.onRename(() => order.push('second listener'));

      await control.rename('tiktok_a', 'tiktok_b');

      expect(order).toEqual(['stop tiktok_a', 'moved tiktok_a tiktok_b', 'second listener']);
    });

    it('never throws, and a failing listener does not keep the next one from running', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const next = jest.fn();
      control.onRename(() => {
        throw new Error('boom');
      });
      control.onRename(next);

      await expect(control.rename('a', 'b')).resolves.toBeUndefined();

      expect(next).toHaveBeenCalledWith('a', 'b');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cannot follow the rename of a'));
      warn.mockRestore();
    });
  });
});
