export type SortKey = "artist" | "title" | "year";

type Sortable = {
  artist: string | null;
  title: string | null;
  year: number | null;
  change_status: string;
};

const str = (s: string | null) => (s ?? "").toLowerCase();

/**
 * Sorts the wantlist by the chosen field. Items that just became available stay
 * pinned above the rest so the "what's new" view is never buried by a sort.
 */
export function sortRows<T extends Sortable>(rows: T[], key: SortKey): T[] {
  const pin = (r: T) => (r.change_status === "now_available" ? 0 : 1);
  const byField = (a: T, b: T) => {
    if (key === "year") {
      const av = a.year ?? Number.NEGATIVE_INFINITY;
      const bv = b.year ?? Number.NEGATIVE_INFINITY;
      if (av !== bv) return bv - av;
      return str(a.artist).localeCompare(str(b.artist));
    }
    if (key === "title") {
      const c = str(a.title).localeCompare(str(b.title));
      return c !== 0 ? c : str(a.artist).localeCompare(str(b.artist));
    }
    const c = str(a.artist).localeCompare(str(b.artist));
    return c !== 0 ? c : str(a.title).localeCompare(str(b.title));
  };
  return [...rows].sort((a, b) => pin(a) - pin(b) || byField(a, b));
}
