import { Semaphore } from './semaphore';

describe('Semaphore', () => {
  it('lets in up to the limit and queues the rest in call order', async () => {
    const semaphore = new Semaphore(1);
    const first = await semaphore.acquire();
    const order: string[] = [];
    const second = semaphore.acquire().then((release) => {
      order.push('second');
      return release;
    });
    const third = semaphore.acquire().then((release) => {
      order.push('third');
      return release;
    });

    await Promise.resolve();
    expect(order).toEqual([]);
    first?.();
    (await second)?.();
    (await third)?.();

    expect(order).toEqual(['second', 'third']);
  });

  it('gives null to a waiter whose signal aborts, without losing the slot', async () => {
    const semaphore = new Semaphore(1);
    const held = await semaphore.acquire();
    const controller = new AbortController();
    const waiting = semaphore.acquire(controller.signal);

    controller.abort();

    expect(await waiting).toBeNull();
    held?.();
    expect(await semaphore.acquire()).not.toBeNull();
  });

  it('gives null at once for a signal that already aborted', async () => {
    expect(await new Semaphore(1).acquire(AbortSignal.abort())).toBeNull();
  });

  it('ignores a second release of the same slot', async () => {
    const semaphore = new Semaphore(1);
    const release = await semaphore.acquire();
    release?.();
    release?.();
    await semaphore.acquire();

    const blocked = await Promise.race([
      semaphore.acquire().then(() => 'granted'),
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 20)),
    ]);

    expect(blocked).toBe('waiting');
  });
});
