import { createServerFn } from "@tanstack/react-start";
import { discogsRequester, DiscogsRateLimitError, RefreshCancelledError } from "./discogs-request";
import { discogsGatewayFetcher } from "./discogs-gateway";
import { z } from "zod";

export const cancelWantlistRefresh = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    // Refresh is intentionally public; cancellation is limited to a specific running run.
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: outcome, error } = await db.rpc("request_wantlist_cancellation", { p_run_id: data.runId });
    if (error) throw new Error("Could not cancel refresh. Please try again.");
    return { requested: outcome === "requested" };
  });

export function computeChangeStatus(prev: number | null | undefined, current: number) {
  if (prev === null || prev === undefined) return "unchanged";
  if (prev === 0 && current > 0) return "now_available";
  if (prev > 0 && current === 0) return "no_longer_available";
  return "unchanged";
}

export const refreshWantlist = createServerFn({ method: "POST" }).handler(async () => {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["UDC_DISCOGS_API_KEY"];
  const username = process.env["DISCOGS_USERNAME"];
  if (!apiKey || !connectionKey || !username) throw new Error("Discogs connection is not configured");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const headers = { "User-Agent": "WantlistWatcher/0.1" };

  const { data: locks, error: lockError } = await db.rpc("acquire_wantlist_refresh");
  const lock = locks?.[0];
  if (lockError || !lock) throw new Error("Could not start refresh");
  if (lock.outcome !== "acquired" || !lock.run_id) {
    return { ok: false, message: lock.outcome === "busy" ? "A refresh is already running. Please wait for it to finish." : "Discogs needs a cooldown before another refresh.", retryAt: lock.retry_after };
  }
  const runId = lock.run_id;
  const updateRun = async (values: { total?: number; checked?: number; status?: string; completed_at?: string; error_count?: number; retry_at?: string | null; lease_expires_at?: string }) => {
    const { error } = await db.from("refresh_runs").update(values).eq("id", runId).eq("status", "running");
    if (error) throw new Error("Could not save refresh progress");
  };
  const checkCancelled = async () => {
    const { data: run, error } = await db.from("refresh_runs").select("status, cancel_requested_at, lease_expires_at").eq("id", runId).single();
    if (error) throw new Error("Could not check refresh status");
    if (run.status !== "running" || run.cancel_requested_at || (run.lease_expires_at && Date.parse(run.lease_expires_at) <= Date.now())) throw new RefreshCancelledError();
  };
  const request = discogsRequester({
    headers,
    fetcher: discogsGatewayFetcher({ apiKey, connectionKey }),
    checkCancelled,
    onBackoff: async (retryAt, delay) => updateRun({ retry_at: retryAt, lease_expires_at: new Date(Date.now() + delay + 120_000).toISOString() }),
    onReady: async () => updateRun({ retry_at: null, lease_expires_at: new Date(Date.now() + 120_000).toISOString() }),
  });

  let errorCount = 0;
  try {
    // Fetch all wantlist pages
    const wants: any[] = [];
    let url: string | null = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants?per_page=100`;
    while (url) {
      const res: Response = await request(url);
      if (!res.ok) throw new Error(`Wantlist fetch failed (${res.status})`);
      const json: any = await res.json();
      wants.push(...(json.wants ?? []));
      url = json.pagination?.urls?.next ?? null;
    }

    const { data: existing, error: readError } = await db.from("wantlist_status").select("release_id, num_for_sale");
    if (readError) throw new Error("Could not read previous wantlist");
    const prevMap = new Map((existing ?? []).map((r) => [Number(r.release_id), r.num_for_sale]));

    await updateRun({ total: wants.length });
    const nextRows = [];

    for (let i = 0; i < wants.length; i++) {
      const w = wants[i];

      const releaseId = Number(w.id);
      const bi = w.basic_information ?? {};
        const res = await request(`https://api.discogs.com/marketplace/stats/${releaseId}`);
        if (!res.ok) throw new Error(String(res.status));
        const stats: any = await res.json();
        const current = Number(stats.num_for_sale ?? 0);
        const prev = prevMap.get(releaseId) ?? null;
        nextRows.push({
          release_id: releaseId,
          artist: (bi.artists ?? []).map((a: any) => a.name).join(", "),
          title: bi.title ?? "",
          format: (bi.formats ?? []).map((f: any) => [f.name, ...(f.descriptions ?? [])].join(" ")).join(", "),
          year: bi.year || null,
          thumb_url: bi.thumb || null,
          num_for_sale: current,
          prev_num_for_sale: prev,
          change_status: computeChangeStatus(prev, current),
          refreshed_at: new Date().toISOString(),
        });
      await updateRun({ checked: i + 1 });
    }
    // Serialize commit with cancellation so no partial or cancelled snapshot is saved.
    const { data: outcome, error } = await db.rpc("commit_wantlist_refresh", { p_run_id: runId, p_rows: nextRows });
    if (error) throw new Error("Could not save refreshed wantlist");
    if (outcome !== "completed") throw new RefreshCancelledError();
    return { ok: true, total: wants.length, errors: errorCount };
  } catch (e) {
    let cancelled = e instanceof RefreshCancelledError;
    if (!cancelled) {
      const { data: run } = await db.from("refresh_runs").select("cancel_requested_at").eq("id", runId).single();
      cancelled = Boolean(run?.cancel_requested_at);
    }
    if (cancelled) {
      // Keep any provider cooldown; release the lease only after processing stops.
      await updateRun({ status: "cancelled", completed_at: new Date().toISOString(), lease_expires_at: new Date().toISOString() });
      return { ok: false, cancelled: true, message: "Refresh cancelled. Your previous results have been kept.", retryAt: null };
    }
    await updateRun({ status: "failed", completed_at: new Date().toISOString(), error_count: errorCount + 1 });
    return { ok: false, message: e instanceof DiscogsRateLimitError ? e.message : "Refresh could not complete. Your previous results have been kept; please try again later.", retryAt: e instanceof DiscogsRateLimitError ? e.retryAt : null };
  }
});
