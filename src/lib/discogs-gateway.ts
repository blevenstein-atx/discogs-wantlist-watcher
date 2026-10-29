const GATEWAY_URL = "https://connector-gateway.lovable.dev/udc_discogs";

// Keep provider pagination URLs, but send every request through the connection.
export function discogsGatewayFetcher(options: {
  apiKey: string;
  connectionKey: string;
  fetcher?: typeof fetch;
}): typeof fetch {
  const fetcher = options.fetcher ?? fetch;
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://api.discogs.com") {
      throw new Error("Unexpected Discogs request destination");
    }
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${options.apiKey}`);
    headers.set("X-Connection-Api-Key", options.connectionKey);
    return fetcher(`${GATEWAY_URL}${url.pathname}${url.search}`, { ...init, headers });
  };
}