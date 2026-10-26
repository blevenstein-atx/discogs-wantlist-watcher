export type RunProgress = {
  phase: "reading" | "checking";
  done: number;
  total: number | null;
  percent: number | null;
};

/**
 * Turns the running refresh row into something the UI can show.
 * Until the wantlist size is known the run is still "reading" its pages.
 */
export function progressOf(run: { total: number | null; checked: number | null } | null | undefined): RunProgress {
  const total = run?.total ?? null;
  const done = run?.checked ?? 0;
  if (!total || total <= 0) return { phase: "reading", done, total: null, percent: null };
  const percent = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  return { phase: "checking", done, total, percent };
}
