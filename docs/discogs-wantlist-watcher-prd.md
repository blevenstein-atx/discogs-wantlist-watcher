# PRD — Discogs Wantlist Watcher

**Status:** Built (proof of concept) · **Owner:** Bruce Levenstein
**App:** https://discogs-wantlist-watcher.lovable.app

---

## 1. Summary

A single-page web app that shows which items in the owner's Discogs wantlist currently have copies for sale, and which items became available or went out of stock since the last check.

## 2. Goals & Non-Goals

**Goals**
- Give a clear, always-current view of which wants are buyable right now.
- Surface what *changed* between refreshes: newly available items, and items that are no longer available.
- Keep the experience read-only and frictionless: no login required to view the page.

**Non-Goals (proof-of-concept scope)**
- No accounts, no per-user wantlists, no editing of the wantlist from the app.
- No performance optimization beyond the conservative refresh pacing (see §5).
- No notifications (email/push) for availability changes.

## 3. Users & Experience

There is a single user (the owner). Visitors need no account — the wantlist status page is intentionally public.

### 3.1 Main page
- Shows **only items with copies currently for sale**.
- Items that **just became available** are pinned at the top of the list, with a "Newly available" badge — regardless of the active sort.
- A collapsible **"No longer available"** section lists items that dropped to zero copies since the last check.
- Header shows: last-refresh time, the previous refresh it's compared against, and counts (e.g. "65 of 86 wants available · 0 newly available · 0 no longer available").
- A **"Changes only"** toggle filters the list down to just the items that changed since the last refresh.

### 3.2 Sorting
- Sortable by **Artist name** (default), **Album title**, or **Release year**.
- Each field can be sorted **Ascending** (default) or **Descending** via an Order dropdown.
- Sort rules: artist ascending with title tiebreak; title ascending with artist tiebreak; release year descending with nulls last and artist tiebreak (order reversed when descending).
- Newly-available items stay pinned above everything else in every sort.

### 3.3 Refresh progress
- A "Refresh" action re-checks the wantlist.
- While refreshing, a progress panel shows a spinning record animation, "Checking N of M" text, and a progress bar (indeterminate sweep until the total item count is known).
- Wording uses "newly available" (not "now available").

## 4. Data & Backend

- **`wantlist_status`** — one row per want: release id, artist, title, format, year, thumbnail, current for-sale count, previous for-sale count, change status (`unchanged` / `now_available` / `no_longer_available`), and refreshed-at timestamp.
- **`refresh_runs`** — audit of each refresh: started/completed timestamps, status, item total, items checked so far (drives the progress panel), and error count.
- Data is stored in the project's backend (Lovable Cloud). Anonymous and authenticated users have read access; the wantlist being public is intentional.
- Discogs connection credentials and the username are kept private and are never exposed on the page.

## 5. Refresh Behavior

- On each refresh the app paginates the owner's wantlist (100 items per page), then fetches the marketplace listing count for each item individually.
- Requests are paced at **~1 request per second** (Discogs allows 60/minute; there is no batch endpoint). A full refresh of ~86 wants takes roughly 90 seconds — accepted as-is for this POC.
- Each refresh compares against the previous run to compute change status, upserts current rows, and deletes wants no longer on the wantlist.
- All outbound Discogs requests, including pagination and retries, use Lovable's linked Discogs connection relay rather than direct requests from the web host.
- A shared refresh lock prevents overlapping checks. Rate-limit responses trigger bounded retries and a visible cooldown countdown; future provider limits remain possible.
- Fetched results are staged until every request succeeds, so a failed refresh preserves the previous snapshot. With relay overhead or cooldowns, a full refresh can take a few minutes.

## 6. Constraints & Decisions

- **Conservative pacing:** stay at ~1 req/sec; no smart-refresh or faster polling (deliberate decision, 2026-10).
- **Public wantlist:** no login needed to view; do not lock it down.
- **POC discipline:** keep scope small; don't add optimization or features not requested.
- **Presentation logic** (progress math, list ordering) lives in small browser-safe modules with unit tests; server logic keeps only data fetching.

## 7. Acceptance Criteria

- A visitor without an account sees the wantlist status page with available items, counts, and change sections.
- Newly available items are badged and pinned at the top under any sort order.
- Sorting by artist / title / year, ascending or descending, orders the list as specified.
- Refreshing shows a live progress panel (record animation, "Checking N of M", progress bar), keeps conservative pacing, and displays a countdown during Discogs cooldowns rather than a misleading counting message.
- Overlapping refreshes are blocked, all Discogs requests use the linked relay, and provider failures leave the previous results intact.
- "Changes only" shows only items whose availability changed since the previous refresh.
