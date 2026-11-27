import { RecentCallCounter } from './recent-call-counter';

describe('RecentCallCounter', () => {
  it('counts only the calls inside the window', () => {
    let now = 0;
    const counter = new RecentCallCounter(1000, () => now);

    counter.record();
    now = 600;
    counter.record();
    expect(counter.count()).toBe(2);

    now = 1001;
    expect(counter.count()).toBe(1);
    now = 1601;
    expect(counter.count()).toBe(0);
  });
});
