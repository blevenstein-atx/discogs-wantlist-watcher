import { describe, expect, it, vi } from "vitest";
import { discogsRequester, DiscogsRateLimitError, retryDelay } from "@/lib/discogs-request";

function setup(responses: Response[]) {
  const fetcher = vi.fn(async () => responses.shift() ?? new Response("", { status: 500 }));
  const wait = vi.fn(async (_ms: number) => {});
  const onBackoff = vi.fn(async (_at: string, _delay: number) => {});
  const onReady = vi.fn(async () => {});
  return { fetcher, wait, onBackoff, onReady, request: discogsRequester({ headers: {}, fetcher, wait, onBackoff, onReady, now: () => 0 }) };
}

describe("Discogs request safeguards", () => {
  it("keeps every request at one second pacing", async () => {
    const io = setup([new Response("{}"), new Response("{}")]);
    await io.request("https://api.discogs.com/first");
    await io.request("https://api.discogs.com/second");
    expect(io.wait.mock.calls).toEqual([[1000], [1000]]);
  });
  it("backs off and retries the same request after a 429", async () => {
    const io = setup([new Response("", { status: 429 }), new Response("{}")]);
    expect((await io.request("https://api.discogs.com/wants")).status).toBe(200);
    expect(io.wait.mock.calls).toEqual([[1000], [60000], [1000]]);
    expect(io.fetcher).toHaveBeenCalledTimes(2);
    expect(io.onReady).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After seconds and HTTP dates", () => {
    expect(retryDelay(new Headers({ "Retry-After": "90" }), 0, 0)).toBe(90000);
    expect(retryDelay(new Headers({ "Retry-After": new Date(90000).toUTCString() }), 0, 0)).toBe(90000);
  });
  it("stops after two retries and records a shared cooldown", async () => {
    const io = setup(Array.from({ length: 3 }, () => new Response("", { status: 429 })));
    await expect(io.request("https://api.discogs.com/wants")).rejects.toBeInstanceOf(DiscogsRateLimitError);
    expect(io.fetcher).toHaveBeenCalledTimes(3);
    expect(io.onBackoff.mock.calls.map((call) => call[1])).toEqual([60000, 120000, 240000]);
  });
  it("does not retry early when Discogs asks for a longer cooldown", async () => {
    const io = setup([new Response("", { status: 429, headers: { "Retry-After": "600" } })]);
    await expect(io.request("https://api.discogs.com/wants")).rejects.toMatchObject({ retryAt: new Date(600000).toISOString() });
    expect(io.fetcher).toHaveBeenCalledTimes(1);
  });
});