# Roadmap

- [x] Refresh animation: spinning record + live progress while a refresh runs
- [x] Wording: the count line reads "newly available", not "now available"
- [x] Sorting options: artist name, album title, release year — default artist
- [x] Sort direction: ascending (default) or descending, for whichever field is chosen
- [x] Recurring 429: prevent overlapping refreshes, back off automatically, and verify recovery
- [x] Show Discogs cooldown in the refresh panel instead of counting status
- [x] Route all Discogs outbound requests through the linked connection relay; verified a full 86-item refresh through the app without errors, with existing pacing and safeguards retained.

- [x] Reconnect progress panel on page load if a refresh is running
- [x] README screenshot in docs/
- [x] Sort by copies for sale (ascending = fewest first)
- [ ] Cancel refresh safely, preserve the last snapshot, and verify cancellation through the app
