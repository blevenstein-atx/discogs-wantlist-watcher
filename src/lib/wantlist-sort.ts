export type SortKey = "artist" | "title" | "year" | "copies";
export type SortDirection = "asc" | "desc";

type Sortable = {
  artist: string | null;
  title: string | null;
  year: number | null;
  change_status: string;
  num_for_sale?: number;
};

const str = (s: string | null) => (s ?? "").toLowerCase();

/**
 * Sorts the wantlist by the chosen field and direction (ascending unless told
 * otherwise). Items that just became available stay pinned above the rest so the
 * "what's new" view is never buried by a sort, and unknown release years always
 * sink to the bottom whichever way the list runs.
 */
export function sortRows<T extends Sortable>(
  rows: T[],
  key: SortKey,
  direction: SortDirection = "asc",
): T[] {
  const dir = direction === "desc" ? -1 : 1;
  const pin = (r: T) => (r.change_status === "now_available" ? 0 : 1);
  const byField = (a: T, b: T) => {
    if (key === "copies") {
      const diff = (a.num_for_sale ?? 0) - (b.num_for_sale ?? 0);
      if (diff !== 0) return dir * diff;
      return str(a.artist).localeCompare(str(b.artist)) || str(a.title).localeCompare(str(b.title));
    }
    if (key === "year") {
      const aUnknown = a.year === null;
      const bUnknown = b.year === null;
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      if (a.year !== b.year) return dir * ((a.year ?? 0) - (b.year ?? 0));
      return str(a.artist).localeCompare(str(b.artist));
    }
    const primary =
      key === "title"
        ? str(a.title).localeCompare(str(b.title))
        : str(a.artist).localeCompare(str(b.artist));
    if (primary !== 0) return dir * primary;
    const tie =
      key === "title"
        ? str(a.artist).localeCompare(str(b.artist))
        : str(a.title).localeCompare(str(b.title));
    return dir * tie;
  };
  return [...rows].sort((a, b) => pin(a) - pin(b) || byField(a, b));
}
