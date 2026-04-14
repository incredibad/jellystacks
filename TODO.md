# TODO

## Features

### Missing movies on collection page
Show a "Not in your library" section beneath the movie grid on the collection detail page.
- Fetch TMDB franchise parts for each collection the movies belong to
- Cross-reference against the local `movies` table (synced from Jellyfin) by `tmdb_id`
- Display parts that have no match as dimmed/distinct cards below the main grid

### Radarr integration — add missing movies
Allow users to send missing movies directly to Radarr from JellyStacks.
- Requires Radarr URL + API key in Settings
- "Add to Radarr" action on missing movie cards (see above)
- POST to Radarr's `/api/v3/movie` endpoint with TMDB ID, quality profile, and root folder
