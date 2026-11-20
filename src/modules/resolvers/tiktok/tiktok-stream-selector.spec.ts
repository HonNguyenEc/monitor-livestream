import {
  AUDIO_ONLY,
  FLV_HD,
  FLV_ORIGIN,
  HLS_HD,
  HLS_ORIGIN,
  liveRoom,
  streamData,
} from './fixtures/tiktok-room.fixtures';
import { selectTikTokStream } from './tiktok-stream-selector';

describe('selectTikTokStream', () => {
  it('returns FLV before HLS for the best quality', () => {
    const room = liveRoom(streamData({ origin: { main: { hls: HLS_ORIGIN, flv: FLV_ORIGIN } } }));
    expect(selectTikTokStream(room)).toEqual({ quality: 'origin', urls: [FLV_ORIGIN, HLS_ORIGIN] });
  });

  it('falls to the next quality when the best has no URL', () => {
    const room = liveRoom(
      streamData({ origin: { main: {} }, hd: { main: { flv: FLV_HD, hls: HLS_HD } } }),
    );
    expect(selectTikTokStream(room)).toEqual({ quality: 'hd', urls: [FLV_HD, HLS_HD] });
  });

  it('accepts a quality with only HLS', () => {
    const room = liveRoom(streamData({ sd: { main: { hls: HLS_HD } } }));
    expect(selectTikTokStream(room)).toEqual({ quality: 'sd', urls: [HLS_HD] });
  });

  it('never picks the audio-only quality', () => {
    expect(
      selectTikTokStream(liveRoom(streamData({ ao: { main: { flv: AUDIO_ONLY } } }))),
    ).toBeNull();
  });

  it.each([
    ['no streamData', liveRoom(undefined)],
    ['invalid JSON', liveRoom('{not json')],
    ['JSON array', liveRoom('[]')],
    ['data not an object', liveRoom(JSON.stringify({ data: 'x' }))],
    ['stream_data not a string', { status: 2, streamData: { pull_data: { stream_data: 5 } } }],
    ['streamData null', { status: 2, streamData: null }],
    ['main not an object', liveRoom(JSON.stringify({ data: { origin: { main: 'x' } } }))],
    ['empty URL strings', liveRoom(streamData({ origin: { main: { flv: '', hls: '' } } }))],
    ['non-string URL', liveRoom(JSON.stringify({ data: { origin: { main: { flv: 7 } } } }))],
  ])('returns null for %s', (_name, room) => {
    expect(selectTikTokStream(room)).toBeNull();
  });
});
