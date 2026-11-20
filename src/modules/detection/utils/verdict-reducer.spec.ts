import { LiveStatus } from '../../../common/enums/live-status.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import {
  applyVerdict,
  LIVE_OBSERVATION,
  NO_VERDICT,
  Observation,
  VerdictState,
} from './verdict-reducer';

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const iso = (offsetSeconds: number): string => new Date(T0 + offsetSeconds * 1000).toISOString();
const OFFLINE: Observation = { status: LiveStatus.OFFLINE, reasonCode: ReasonCode.NOT_LIVE };
const UNKNOWN: Observation = { status: LiveStatus.UNKNOWN, reasonCode: ReasonCode.BACKEND_ERROR };
const NO_SIGNAL: Observation = { status: LiveStatus.NO_SIGNAL, reasonCode: ReasonCode.NO_FRAMES };

function run(steps: Array<[Observation, number]>, from: VerdictState = NO_VERDICT): VerdictState {
  return steps.reduce(
    (state, [observation, seconds]) => applyVerdict(state, observation, T0 + seconds * 1000),
    from,
  );
}

describe('applyVerdict', () => {
  it('reports a first non-live verdict at once, with its reason', () => {
    expect(run([[OFFLINE, 0]])).toEqual({
      status: LiveStatus.OFFLINE,
      reasonCode: ReasonCode.NOT_LIVE,
      misses: 1,
      liveSince: null,
      checkedAt: iso(0),
    });
  });

  it('sets live_since when the channel becomes live and keeps it while it stays live', () => {
    const state = run([
      [LIVE_OBSERVATION, 0],
      [LIVE_OBSERVATION, 30],
    ]);

    expect(state).toMatchObject({ status: LiveStatus.LIVE, liveSince: iso(0), checkedAt: iso(30) });
  });

  it('keeps a live channel live through one miss and reports the 2nd miss', () => {
    const afterOne = run([
      [LIVE_OBSERVATION, 0],
      [UNKNOWN, 5],
    ]);
    const afterTwo = applyVerdict(afterOne, UNKNOWN, T0 + 10_000);

    expect(afterOne).toMatchObject({ status: LiveStatus.LIVE, reasonCode: null, misses: 1 });
    expect(afterOne.liveSince).toBe(iso(0));
    expect(afterTwo).toMatchObject({
      status: LiveStatus.UNKNOWN,
      reasonCode: ReasonCode.BACKEND_ERROR,
      misses: 2,
      liveSince: null,
    });
  });

  it('counts every kind of non-live verdict as a miss', () => {
    for (const miss of [OFFLINE, UNKNOWN, NO_SIGNAL]) {
      const state = run([
        [LIVE_OBSERVATION, 0],
        [miss, 5],
        [miss, 10],
      ]);
      expect(state.status).toBe(miss.status);
    }
  });

  it('a live verdict resets the misses, so the next lone miss is forgiven again', () => {
    const state = run([
      [LIVE_OBSERVATION, 0],
      [UNKNOWN, 5],
      [LIVE_OBSERVATION, 10],
      [UNKNOWN, 15],
    ]);

    expect(state).toMatchObject({ status: LiveStatus.LIVE, misses: 1, liveSince: iso(0) });
  });

  it('starts a new live_since when a channel that left live comes back', () => {
    const state = run([
      [LIVE_OBSERVATION, 0],
      [OFFLINE, 5],
      [OFFLINE, 10],
      [LIVE_OBSERVATION, 100],
    ]);

    expect(state).toMatchObject({ status: LiveStatus.LIVE, liveSince: iso(100), misses: 0 });
  });

  it('does not forgive a miss for a channel that was not live', () => {
    const state = run([
      [OFFLINE, 0],
      [UNKNOWN, 5],
    ]);

    expect(state).toMatchObject({ status: LiveStatus.UNKNOWN, misses: 2 });
  });

  it('does not change its input', () => {
    const before = { ...NO_VERDICT };

    applyVerdict(NO_VERDICT, LIVE_OBSERVATION, T0);

    expect(NO_VERDICT).toEqual(before);
  });
});
