import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { refreshWantlist } from "@/lib/wantlist.functions";
import { cooldownOf, progressOf, type RunProgress } from "@/lib/wantlist-progress";
import { sortRows, type SortDirection, type SortKey } from "@/lib/wantlist-sort";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Discogs Wantlist Watcher" },
      { name: "description", content: "See which Discogs wantlist items have copies for sale and what changed since last refresh." },
      { property: "og:title", content: "Discogs Wantlist Watcher" },
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
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("artist");
  const [dir, setDir] = useState<SortDirection>("asc");

  const [progress, setProgress] = useState<RunProgress>(() => progressOf(null));

  // While a refresh is running, ask the backend how far it has got.
  useEffect(() => {
    if (!running) return;
    let stop = false;
    const tick = async () => {
      const { data: run } = await supabase
        .from("refresh_runs")
        .select("total, checked, retry_at")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!stop) { setProgress(progressOf(run)); setRetryAt(run?.retry_at ?? null); }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => { stop = true; clearInterval(id); };
  }, [running]);

  const onRefresh = async () => {
    setRunning(true); setErr(null); setRetryAt(null); setProgress(progressOf(null));
    try {
      const result = await refresh();
      if (!result.ok) { setErr(result.message); setRetryAt(result.retryAt); }
      else setRetryAt(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Refresh failed"); }
    finally { setRunning(false); qc.invalidateQueries({ queryKey: ["wantlist"] }); }
  };

  const rows = data?.rows ?? [];
  const available = rows.filter((r) => r.num_for_sale > 0);
  const nowAvail = rows.filter((r) => r.change_status === "now_available");
  const gone = rows.filter((r) => r.change_status === "no_longer_available");
  const sorted = sortRows(available, sort, dir);
  const main = changesOnly ? sorted.filter((r) => r.change_status === "now_available") : sorted;
  const [last, prev] = data?.runs ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">Discogs Wantlist Watcher</h1>
          <p className="text-sm text-muted-foreground">Last refresh: {last ? fmt(last.completed_at) : "never"}</p>
          <p className="text-sm text-muted-foreground">
            {prev ? `Compared to: ${fmt(prev.completed_at)}` : "First refresh — baseline only"}
          </p>
          <p className="pt-1 text-sm font-medium">
            {available.length} of {rows.length} wants available · {nowAvail.length} newly available · {gone.length} no longer available
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button onClick={onRefresh} disabled={running}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {running ? "Refreshing…" : "Refresh"}
          </button>
          <div className="flex flex-col items-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border bg-background px-2 py-1 text-sm">
                <option value="artist">Artist name</option>
                <option value="title">Album title</option>
                <option value="year">Release year</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Order
              <select value={dir} onChange={(e) => setDir(e.target.value as SortDirection)}
                className="rounded-md border bg-background px-2 py-1 text-sm">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} className="accent-primary" />
              Changes only
            </label>
          </div>
        </div>
      </header>

      {running && <RefreshProgress progress={progress} retryAt={retryAt} />}
      {!running && retryAt && <p className="mb-4 text-sm text-muted-foreground">Discogs cooldown until {fmt(retryAt)}. Please wait before refreshing again.</p>}
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

function RefreshProgress({ progress, retryAt }: { progress: RunProgress; retryAt: string | null }) {
  const { phase, done, total, percent } = progress;
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const seconds = now ? cooldownOf(retryAt, now) : null;
  return (
    <div className="mb-8 flex items-center gap-5 rounded-lg border bg-card p-5" role="status" aria-live="polite">
      <div className="vinyl relative h-20 w-20 shrink-0">
        <div className="vinyl-label absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold">
          {retryAt ? "Waiting for Discogs…" : phase === "checking" ? `Checking ${done} of ${total}` : "Reading your wantlist…"}
        </p>
        <p className="text-sm text-muted-foreground">
          {retryAt
            ? seconds === 0 ? "Retrying automatically…" : `Discogs has limited requests. ${seconds === null ? "Retrying shortly" : `Retrying in ${seconds} seconds`}…`
            : phase === "checking" ? "About one item per second — keep this tab open." : "Counting your wants first."}
        </p>
        {retryAt ? <p className="mt-3 text-xs text-muted-foreground">Your previous results are kept. Cooldown until {fmt(retryAt)}.</p> : percent === null ? (
          <div className="progress-sweep mt-3 h-1.5 w-full rounded-full bg-muted" />
        ) : (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </div>
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
            {r.change_status === "now_available" && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Newly available</span>}
          </div>
          <p className="truncate text-sm">{r.title}</p>
          <p className="truncate text-xs text-muted-foreground">{[r.format, r.year].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="whitespace-nowrap text-sm text-muted-foreground">{r.num_for_sale} for sale</span>
      </a>
    </li>
  );
}
