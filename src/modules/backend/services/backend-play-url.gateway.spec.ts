import { FakeLoginState } from '../../../../test/helpers/fake-login-state';
import { BackendApiClient } from '../clients/backend-api.client';
import { SESSION_SOURCE_CURRENT, SESSION_SOURCE_SCHEDULE } from '../constants/backend.constants';
import { BackendSchedule } from '../models/backend-schedule.model';
import { PlayUrlAnswer } from '../models/play-url-answer.model';
import { BackendPlayUrlGateway } from './backend-play-url.gateway';
import { BackendSyncStore } from './backend-sync-store.service';

const ANSWER: PlayUrlAnswer = {
  sessionId: '1234567',
  shopeeStatus: 1,
  isLive: true,
  title: 'T',
  shareUrl: null,
  playUrl: 'https://play.example.invalid/x.flv',
  expiresAt: null,
};
const SCHEDULE = { scheduleId: 's1', sessionId: '1234567' } as BackendSchedule;

describe('BackendPlayUrlGateway', () => {
  let login: FakeLoginState;
  let playUrl: jest.Mock;
  let store: BackendSyncStore;
  let gateway: BackendPlayUrlGateway;

  beforeEach(() => {
    login = new FakeLoginState();
    playUrl = jest.fn().mockResolvedValue(ANSWER);
    store = new BackendSyncStore(login);
    gateway = new BackendPlayUrlGateway(login, { playUrl } as unknown as BackendApiClient, store);
  });

  it('answers and remembers the session with a masked id and where it came from', async () => {
    const signal = new AbortController().signal;

    const lookup = await gateway.lookup('b1', '1234567', SCHEDULE, 5000, signal);

    expect(playUrl).toHaveBeenCalledWith('b1', '1234567', 5000, signal);
    expect(lookup).toEqual({ answer: ANSWER, source: SESSION_SOURCE_SCHEDULE });
    expect(store.sessionOf('b1')).toMatchObject({
      sessionId: expect.stringMatching(/•+4567$/),
      isLive: true,
      source: SESSION_SOURCE_SCHEDULE,
      scheduleId: 's1',
    });
  });

  it('reports the brand current session without a schedule', async () => {
    const lookup = await gateway.lookup('b1', '', null, 5000);

    expect(lookup.source).toBe(SESSION_SOURCE_CURRENT);
    expect(store.sessionOf('b1')).toMatchObject({ scheduleId: null });
  });

  it('does not remember an answer that came back after the login changed', async () => {
    playUrl.mockImplementation(() => {
      login.relogin();
      return Promise.resolve(ANSWER);
    });

    await gateway.lookup('b1', '', null, 5000);

    expect(store.sessionOf('b1')).toBeNull();
  });

  it('lets a failure of the call through, remembering nothing', async () => {
    playUrl.mockRejectedValue(new Error('down'));

    await expect(gateway.lookup('b1', '', null, 5000)).rejects.toThrow('down');
    expect(store.sessionOf('b1')).toBeNull();
  });

  it('exposes the login state', () => {
    login.connected = false;

    expect(gateway.connected).toBe(false);
    expect(gateway.epoch).toBe(login.epoch);
  });
});
