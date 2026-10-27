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

