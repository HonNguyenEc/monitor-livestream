import { Detector } from '../../../common/enums/detector.enum';
import { DetectorEnd, FrameDetector } from './frame-detector.interface';
import { pickDetector } from './pick-detector';

const detector = (kind: Detector): FrameDetector => ({
  kind,
  available: () => Promise.resolve(true),
  run: () => Promise.resolve(DetectorEnd.STOPPED),
});

describe('pickDetector', () => {
  const ffmpeg = detector(Detector.FFMPEG);
  const mpv = detector(Detector.MPV);

  it('picks the detector the settings name', () => {
    expect(pickDetector([mpv, ffmpeg], Detector.MPV)).toBe(mpv);
    expect(pickDetector([mpv, ffmpeg], Detector.FFMPEG)).toBe(ffmpeg);
  });

  it('fails loudly for a detector nothing implements', () => {
    expect(() => pickDetector([ffmpeg], Detector.MPV)).toThrow('No frame detector for mpv');
  });
});
