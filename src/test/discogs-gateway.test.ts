import { describe, expect, it, vi } from "vitest";
import { discogsGatewayFetcher } from "@/lib/discogs-gateway";
import { discogsRequester } from "@/lib/discogs-request";

describe("Discogs connection routing", () => {
  it("routes wantlist pages and marketplace checks through the relay with their query intact", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
    const request = discogsGatewayFetcher({ apiKey: "test-app-key", connectionKey: "test-connection-key", fetcher });
    await request("https://api.discogs.com/users/bruce/wants?per_page=100&page=2", { headers: { "User-Agent": "WantlistWatcher/0.1" } });
    await request("https://api.discogs.com/marketplace/stats/123");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://connector-gateway.lovable.dev/udc_discogs/users/bruce/wants?per_page=100&page=2",
      "https://connector-gateway.lovable.dev/udc_discogs/marketplace/stats/123",
    ]);
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-app-key");
    expect(headers.get("X-Connection-Api-Key")).toBe("test-connection-key");
    expect(headers.get("User-Agent")).toBe("WantlistWatcher/0.1");
  });

  it("rejects other destinations without sending connection credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const request = discogsGatewayFetcher({ apiKey: "test-app-key", connectionKey: "test-connection-key", fetcher });
    await expect(request("https://example.com/marketplace/stats/123")).rejects.toThrow("Unexpected Discogs request destination");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps one-second pacing and retries on the relay without falling back to Discogs directly", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}"));
    const wait = vi.fn(async (_ms: number) => {});
    const request = discogsRequester({
      headers: {}, fetcher: discogsGatewayFetcher({ apiKey: "test-app-key", connectionKey: "test-connection-key", fetcher }),
      wait, onBackoff: async () => {}, onReady: async () => {}, now: () => 0,
    });
    await request("https://api.discogs.com/marketplace/stats/123");
    expect(wait.mock.calls).toEqual([[1000], [60000], [1000]]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(Array(2).fill("https://connector-gateway.lovable.dev/udc_discogs/marketplace/stats/123"));
  });
});