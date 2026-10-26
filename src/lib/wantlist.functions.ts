import { createServerFn } from "@tanstack/react-start";

export function computeChangeStatus(prev: number | null | undefined, current: number) {
  if (prev === null || prev === undefined) return "unchanged";
  if (prev === 0 && current > 0) return "now_available";
  if (prev > 0 && current === 0) return "no_longer_available";
  return "unchanged";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const refreshWantlist = createServerFn({ method: "POST" }).handler(async () => {
  const token = process.env["DISCOGS_TOKEN"];
  const username = process.env["DISCOGS_USERNAME"];
  if (!token || !username) throw new Error("Discogs credentials are not configured");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const headers = { Authorization: `Discogs token=${token}`, "User-Agent": "WantlistWatcher/0.1" };

  const { data: run, error: runErr } = await db.from("refresh_runs").insert({ status: "running" }).select().single();
  if (runErr || !run) throw new Error("Could not start refresh");

  let errorCount = 0;
  try {
    // Fetch all wantlist pages
    const wants: any[] = [];
    let url: string | null = `https://api.discogs.com/users/${encodeURIComponent(username)}/wants?per_page=100`;
    while (url) {
      const res: Response = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Wantlist fetch failed (${res.status})`);
      const json: any = await res.json();
      wants.push(...(json.wants ?? []));
      url = json.pagination?.urls?.next ?? null;
      if (url) await sleep(1000);
    }

    const { data: existing } = await db.from("wantlist_status").select("release_id, num_for_sale");
    const prevMap = new Map((existing ?? []).map((r) => [Number(r.release_id), r.num_for_sale]));

    for (const w of wants) {
      await sleep(1000);
      const releaseId = Number(w.id);
      const bi = w.basic_information ?? {};
      try {
        const res = await fetch(`https://api.discogs.com/marketplace/stats/${releaseId}`, { headers });
        if (!res.ok) throw new Error(String(res.status));
        const stats: any = await res.json();
        const current = Number(stats.num_for_sale ?? 0);
        const prev = prevMap.has(releaseId) ? prevMap.get(releaseId)! : null;
        await db.from("wantlist_status").upsert({
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
      } catch {
        errorCount++;
      }
    }

    const keep = new Set(wants.map((w) => Number(w.id)));
    const stale = [...prevMap.keys()].filter((id) => !keep.has(id));
    if (stale.length) await db.from("wantlist_status").delete().in("release_id", stale);

    await db.from("refresh_runs").update({ status: "completed", completed_at: new Date().toISOString(), error_count: errorCount }).eq("id", run.id);
    return { ok: true, total: wants.length, errors: errorCount };
  } catch (e) {
    await db.from("refresh_runs").update({ status: "failed", error_count: errorCount + 1 }).eq("id", run.id);
    throw e;
  }
});
