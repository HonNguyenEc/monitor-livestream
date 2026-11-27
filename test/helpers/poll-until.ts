const POLL_STEP_MS = 20;

/** Reads until `done` holds or `limitMs` passed, and gives the last value read. */
export async function pollUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  limitMs: number,
): Promise<T> {
  const giveUpAt = Date.now() + limitMs;
  for (let value = await read(); ; value = await read()) {
    if (done(value) || Date.now() > giveUpAt) return value;
    await new Promise((resolve) => setTimeout(resolve, POLL_STEP_MS));
  }
}
