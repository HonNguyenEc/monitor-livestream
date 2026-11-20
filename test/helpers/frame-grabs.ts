import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  FfmpegFrameGrabber,
  GrabOutcome,
} from '../../src/modules/detection/detectors/ffmpeg-frame-grabber';

export type Grab = FfmpegFrameGrabber['grab'];

export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

/** A grab that never ends on its own, like ffmpeg waiting on a stalled stream; a stop cuts it short. */
export const hang: Grab = (_url, _destination, signal) =>
  new Promise((resolve) =>
    signal.addEventListener('abort', () => resolve(GrabOutcome.NO_FRAME), { once: true }),
  );

/** A grab that finds a frame every time. */
export const writeFrame: Grab = async (_url, destination) => {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JPEG);
  return GrabOutcome.FRAME;
};
