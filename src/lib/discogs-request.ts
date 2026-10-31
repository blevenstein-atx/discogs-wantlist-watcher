export const DISCOGS_PACING_MS = 1000;
const MAX_RETRIES = 2;
const MAX_WAIT_MS = 120_000;

export class DiscogsRateLimitError extends Error {
  constructor(public retryAt: string) {
    super("Discogs is still limiting requests. Please try again after the cooldown.");
  }
}

export class RefreshCancelledError extends Error {}

export function retryDelay(headers: Headers, attempt: number, now = Date.now()) {
  const value = headers.get("Retry-After");
  const seconds = value === null ? NaN : Number(value);
  const requested = Number.isFinite(seconds)
    ? seconds * 1000
    : value ? Date.parse(value) - now : 0;
  return Math.max(60_000 * 2 ** attempt, Number.isFinite(requested) ? requested : 0);
}

// Injectable I/O lets tests exercise recovery without making Discogs requests.
export function discogsRequester(options: {
  headers: HeadersInit;
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  onBackoff: (retryAt: string, delay: number) => Promise<void>;
  onReady: () => Promise<void>;
  checkCancelled?: () => Promise<void>;
}) {
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const pause = async (ms: number) => {
    if (!options.checkCancelled) { await wait(ms); return; }
    for (let remaining = ms; remaining > 0; remaining -= 1000) {
      await options.checkCancelled();
      await wait(Math.min(1000, remaining));
    }
    await options.checkCancelled();
  };
  return async (url: string): Promise<Response> => {
    // Pace every request, including the first page and retry attempts.
    for (let attempt = 0; ; attempt++) {
      await pause(DISCOGS_PACING_MS);
      const response = await fetcher(url, { headers: options.headers, signal: AbortSignal.timeout(30_000) });
      if (response.status !== 429) {
        await options.onReady();
        return response;
      }
      const delay = retryDelay(response.headers, attempt, now());
      const retryAt = new Date(now() + delay).toISOString();
      await options.onBackoff(retryAt, delay);
      await response.body?.cancel();
      if (attempt >= MAX_RETRIES || delay > MAX_WAIT_MS) throw new DiscogsRateLimitError(retryAt);
      await pause(delay);
    }
  };
}