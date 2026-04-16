# TODO

## Features

### Radarr integration — add missing movies
Allow users to send missing movies directly to Radarr from JellyStacks.
- Requires Radarr URL + API key in Settings
- "Add to Radarr" action on missing movie cards on the collection detail page
- POST to Radarr's `/api/v3/movie` endpoint with TMDB ID, quality profile, and root folder

### Scheduled bulk actions
Allow users to configure bulk operations to run on a schedule from the Settings screen.
- Schedule: Detect TMDB, Verify Status, Push All (individually toggleable)
- Configurable interval (e.g. daily, every X hours)
- Run automatically in the background on the server side

## Completed

### Missing movies on collection page ✓
Unowned TMDB franchise parts are shown in a collapsible "Not in your library" section
on the collection detail page, with dimmed poster cards and a "Not in library" badge.
