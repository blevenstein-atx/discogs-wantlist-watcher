<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules

- Presentation-only logic (progress math, list ordering) lives in small browser-safe modules under `src/lib` with a matching vitest file in `src/test`, so it can be tested without a server; server functions keep only data fetching and stay free of display rules.
- List ordering pins items that just became available above the rest, whatever field the user sorts by, so new finds are never buried.
- Discogs calls use the tested request helper for pacing and bounded 429 backoff; a service-only database RPC acquires a shared refresh lease so separate tabs and workers cannot overlap. Stage fetched rows until all requests succeed to preserve the previous snapshot on provider failures.
- All Discogs requests, including pagination and retries, go through the linked Discogs connector gateway with server-only connection credentials; never fall back to direct provider requests, so the alternate outbound path remains consistent.
- Refresh progress prioritizes persisted Discogs cooldown state over reading/checking labels, with countdown math in the tested browser-safe progress module.
- Cancellation is a persisted request on a specific run; the worker checks it during pacing and cooldown waits, and a service-only atomic commit serializes snapshot replacement with cancellation so cancelled runs never save partial results or release their lease before stopping.

