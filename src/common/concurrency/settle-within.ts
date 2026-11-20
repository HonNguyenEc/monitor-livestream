/** Settles like `promise`, or with `fallback` after `ms`; the timer goes once `promise` settles. Uses the global timer, so fake timers drive it. */
export function settleWithin<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms, fallback);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
