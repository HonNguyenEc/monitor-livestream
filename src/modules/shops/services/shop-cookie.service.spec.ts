import { Logger } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { CookieRepository } from '../repositories/cookie.repository';
import { ShopCookieService } from './shop-cookie.service';

describe('ShopCookieService', () => {
  const load = jest.fn();
  const save = jest.fn();
  const service = new ShopCookieService({ load, save } as unknown as CookieRepository);
  const unreadable = (): DomainException =>
    new DomainException(ErrorCode.COOKIES_FILE_UNREADABLE, 'x');

  beforeEach(() => {
    load.mockReset();
    save.mockReset();
  });

  it('peek reads an unreadable file as empty but lets other errors through', async () => {
    load.mockRejectedValueOnce(unreadable());
    expect(await service.peek()).toEqual({});

    load.mockRejectedValueOnce(new Error('bug'));
    await expect(service.peek()).rejects.toThrow('bug');
  });

  it('remember refuses to write when the file cannot be read', async () => {
    load.mockRejectedValue(unreadable());

    await expect(service.remember('c', 1)).rejects.toThrow(DomainException);
    expect(save).not.toHaveBeenCalled();
  });

  it('undo restores the previous value, or removes a new entry', async () => {
    load.mockResolvedValueOnce({ '1': 'old' });
    const replaced = await service.remember('new', 1);
    load.mockResolvedValueOnce({ '1': 'new' });
    await replaced.undo();
    expect(save).toHaveBeenLastCalledWith({ '1': 'old' });

    load.mockResolvedValueOnce({});
    const added = await service.remember('new', 2);
    load.mockResolvedValueOnce({ '2': 'new' });
    await added.undo();
    expect(save).toHaveBeenLastCalledWith({});
  });

  it('undo puts back the stored value as it was, even when it is not a string', async () => {
    load.mockResolvedValueOnce({ '1': { raw: true } });
    const remembered = await service.remember('new', 1);
    load.mockResolvedValueOnce({ '1': 'new' });

    await remembered.undo();

    expect(save).toHaveBeenLastCalledWith({ '1': { raw: true } });
  });

  it('forgetUnused swallows a failed write: the shop change is already saved', async () => {
    load.mockResolvedValue({ '1': 'c' });
    save.mockRejectedValue(Object.assign(new Error('locked'), { code: 'EPERM' }));

    await expect(service.forgetUnused(1, [])).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('undo logs the error name and code, never a value, and does not throw', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    load.mockResolvedValueOnce({ '1': 'secret-old' });
    const remembered = await service.remember('secret-new', 1);
    load.mockRejectedValueOnce(Object.assign(new Error('secret-new'), { code: 'EPERM' }));

    await expect(remembered.undo()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Error EPERM$/));
    warn.mockRestore();
  });

  it('forgetUnused keeps a cookie another shop still uses', async () => {
    load.mockResolvedValue({ '1': 'c' });

    await service.forgetUnused(1, [{ user_id: 1 }]);

    expect(save).not.toHaveBeenCalled();
  });
});
