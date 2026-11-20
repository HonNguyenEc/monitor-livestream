import { Detector } from '../../../common/enums/detector.enum';
import { FrameDetector } from './frame-detector.interface';

/** The detector the settings name; every value of the setting has one, so a miss is a wiring mistake. */
export function pickDetector(detectors: readonly FrameDetector[], kind: Detector): FrameDetector {
  const detector = detectors.find((candidate) => candidate.kind === kind);
  if (!detector) throw new Error(`No frame detector for ${kind}`);
  return detector;
}
