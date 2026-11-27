// `testTimeout` inside a project of jest.config.js is ignored, so the limit is set here, where every project loads it.
const TEST_TIMEOUT_MS = 30_000;
jest.setTimeout(TEST_TIMEOUT_MS);

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1'];
const BLOCKED_MESSAGE = 'A test called fetch on a non-loopback host';

let blocked: string[] = [];

function hostOf(input: Parameters<typeof fetch>[0]): string {
  const url = input instanceof Request ? input.url : String(input);
  return URL.parse(url)?.hostname ?? url;
}

const realFetch = globalThis.fetch;

// A caught rejection would hide the call, so the afterEach hook below fails the test whatever the code under test does with it.
globalThis.fetch = (input, init) => {
  const host = hostOf(input);
  if (LOOPBACK_HOSTS.includes(host)) return realFetch(input, init);
  blocked.push(host);
  return Promise.reject(new Error(`${BLOCKED_MESSAGE}: ${host}`));
};

afterEach(() => {
  const hosts = blocked;
  blocked = [];
  if (hosts.length > 0) {
    throw new Error(`${BLOCKED_MESSAGE}: ${[...new Set(hosts)].join(', ')}`);
  }
});
