import { PLAYING_CHECK_MS } from '../constants/detection.constants';
import { FfmpegFrameGrabber, GrabOutcome } from './ffmpeg-frame-grabber';
import { FfmpegFrameDetector } from './ffmpeg-frame.detector';
import { DetectorEnd, DetectorReport, DetectorRun } from './frame-detector.interface';

describe('FfmpegFrameDetector', () => {
  const grab = jest.fn<Promise<GrabOutcome>, [string, string, AbortSignal]>();
  const available = jest.fn<Promise<boolean>, []>();
  const detector = new FfmpegFrameDetector({ grab, available } as unknown as FfmpegFrameGrabber);
  const report: jest.Mocked<DetectorReport> = { checking: jest.fn(), frame: jest.fn() };
  const run = (signal: AbortSignal = new AbortController().signal): Promise<DetectorEnd> =>
    detector.run({
      url: 'https://cdn.example/live.flv',
      framePath: 'C:/frames/latest.jpg',
      signal,
      report,
    } as unknown as DetectorRun);

  beforeEach(() => {
    jest.useFakeTimers();
    grab.mockReset();
    report.checking.mockClear();
    report.frame.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('is no_signal when the first grab brings no frame', async () => {
    grab.mockResolvedValue(GrabOutcome.NO_FRAME);

    expect(await run()).toBe(DetectorEnd.NO_SIGNAL);
    expect(report.checking).toHaveBeenCalledTimes(1);
    expect(report.frame).not.toHaveBeenCalled();
  });

  it('reports a frame, grabs again every 30 s, and ends as lost frames once one is missing', async () => {
    grab
      .mockResolvedValueOnce(GrabOutcome.FRAME)
      .mockResolvedValueOnce(GrabOutcome.FRAME)
      .mockResolvedValue(GrabOutcome.NO_FRAME);

    const ended = run();
    await jest.advanceTimersByTimeAsync(PLAYING_CHECK_MS - 1);
    expect(grab).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(grab).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(PLAYING_CHECK_MS);

    expect(await ended).toBe(DetectorEnd.LOST_FRAMES);
    expect(report.frame).toHaveBeenCalledTimes(2);
    expect(grab.mock.calls[0].slice(0, 2)).toEqual([
      'https://cdn.example/live.flv',
      'C:/frames/latest.jpg',
    ]);
  });

  it('is available when the grabber finds FFmpeg', async () => {
    available.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(await detector.available()).toBe(true);
    expect(await detector.available()).toBe(false);
  });

  it('a missing FFmpeg ends the run as tool_missing', async () => {
    grab.mockResolvedValue(GrabOutcome.TOOL_MISSING);

    expect(await run()).toBe(DetectorEnd.TOOL_MISSING);
  });

  it('ends as stopped when the job is stopped during the wait, with no timer left', async () => {
    const own = new AbortController();
    grab.mockResolvedValue(GrabOutcome.FRAME);
    const ended = run(own.signal);
    await jest.advanceTimersByTimeAsync(10);

    own.abort();

    expect(await ended).toBe(DetectorEnd.STOPPED);
    expect(jest.getTimerCount()).toBe(0);
  });
});
