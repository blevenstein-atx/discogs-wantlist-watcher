import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { refreshWantlist } from "@/lib/wantlist.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wantlist Watcher — Discogs availability" },
      { name: "description", content: "See which Discogs wantlist items have copies for sale and what changed since last refresh." },
      { property: "og:title", content: "Wantlist Watcher" },
      { property: "og:description", content: "Discogs wantlist availability and changes at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Row = {
  release_id: number; artist: string | null; title: string | null; format: string | null;
  year: number | null; thumb_url: string | null; num_for_sale: number; change_status: string;
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

async function load() {
  const [runs, rows] = await Promise.all([
    supabase.from("refresh_runs").select("completed_at").eq("status", "completed").order("completed_at", { ascending: false }).limit(2),
    supabase.from("wantlist_status").select("*").order("artist"),
  ]);
  return { runs: runs.data ?? [], rows: (rows.data ?? []) as Row[] };
}

function Index() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["wantlist"], queryFn: load });
  const refresh = useServerFn(refreshWantlist);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);

  const onRefresh = async () => {
    setRunning(true); setErr(null);
    try { await refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setRunning(false); qc.invalidateQueries({ queryKey: ["wantlist"] }); }
  };

  const rows = data?.rows ?? [];
  const available = rows.filter((r) => r.num_for_sale > 0);
  const nowAvail = rows.filter((r) => r.change_status === "now_available");
  const gone = rows.filter((r) => r.change_status === "no_longer_available");
  const sorted = [...available].sort((a, b) => {
    const an = a.change_status === "now_available" ? 0 : 1, bn = b.change_status === "now_available" ? 0 : 1;
    return an - bn || (a.artist ?? "").localeCompare(b.artist ?? "");
  });
  const main = changesOnly ? sorted.filter((r) => r.change_status === "now_available") : sorted;
  const [last, prev] = data?.runs ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">Wantlist Watcher</h1>
          <p className="text-sm text-muted-foreground">Last refresh: {last ? fmt(last.completed_at) : "never"}</p>
          <p className="text-sm text-muted-foreground">
            {prev ? `Compared to: ${fmt(prev.completed_at)}` : "First refresh — baseline only"}
          </p>
          <p className="pt-1 text-sm font-medium">
            {available.length} of {rows.length} wants available · {nowAvail.length} now available · {gone.length} no longer available
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button onClick={onRefresh} disabled={running}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {running ? "Refreshing… (≈1s per item)" : "Refresh"}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} className="accent-primary" />
            Changes only
          </label>
        </div>
      </header>

      {err && <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          {main.length === 0 ? (
            <p className="text-sm text-muted-foreground">{rows.length === 0 ? "No data yet — press Refresh." : "Nothing to show."}</p>
          ) : (
            <ul className="divide-y">{main.map((r) => <Item key={r.release_id} r={r} />)}</ul>
          )}
          {gone.length > 0 && (
            <details className="mt-10 rounded-lg border bg-card" open={changesOnly}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">No longer available ({gone.length})</summary>
              <ul className="divide-y border-t px-2">{gone.map((r) => <Item key={r.release_id} r={r} />)}</ul>
            </details>
          )}
        </>
      )}
    </main>
  );
}

function Item({ r }: { r: Row }) {
  return (
    <li>
      <a href={`https://www.discogs.com/sell/release/${r.release_id}`} target="_blank" rel="noreferrer"
        className="flex items-center gap-4 rounded-md px-2 py-3 transition hover:bg-accent">
        {r.thumb_url ? <img src={r.thumb_url} alt="" className="h-14 w-14 rounded object-cover" loading="lazy" />
          : <div className="h-14 w-14 rounded bg-muted" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{r.artist}</p>
            {r.change_status === "now_available" && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Now available</span>}
          </div>
          <p className="truncate text-sm">{r.title}</p>
          <p className="truncate text-xs text-muted-foreground">{[r.format, r.year].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="whitespace-nowrap text-sm text-muted-foreground">{r.num_for_sale} for sale</span>
      </a>
    </li>
  );
}
