import { AsyncLock } from './async-lock';

describe('AsyncLock', () => {
  it('runs tasks one at a time, in call order', async () => {
    const lock = new AsyncLock();
    const events: string[] = [];
    const task = (name: string, ticks: number) => async (): Promise<string> => {
      events.push(`${name}:start`);
      for (let tick = 0; tick < ticks; tick += 1) {
        await Promise.resolve();
      }
      events.push(`${name}:end`);
      return name;
    };

    const results = await Promise.all([
      lock.run(task('a', 5)),
      lock.run(task('b', 1)),
      lock.run(task('c', 0)),
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('hands a failure to its own caller and still runs the next task', async () => {
    const lock = new AsyncLock();

    const failed = lock.run(() => Promise.reject(new Error('boom')));
    const next = lock.run(() => Promise.resolve('ok'));

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
