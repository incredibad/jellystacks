# Changelog

All notable changes are documented here, newest first.

---

## [0.2.8] — 2026-04-13

### Fixed
- Collection artwork was silently not uploaded to Jellyfin because `httpx` does not follow redirects by default; the TMDB image CDN can issue redirects that caused the fetch to receive a 3xx response, which the `status_code != 200` guard then bailed on without raising an error — fixed by fetching artwork via a dedicated client with `follow_redirects=True`

---

## [0.2.7] — 2026-04-13

### Added
- Grid/list view toggle on the Movies page and Collection detail movies section; preference persisted to `localStorage` separately for each page (`jellystacks:movies-view`, `jellystacks:collection-view`)
- New `MovieListRow` component: horizontal row with mini poster, title, and `year · library · rating` metadata; collection detail list view includes a hover-reveal remove button

---

## [0.2.6] — 2026-04-13

### Changed
- Library name now shown on every movie reference: as a semi-transparent pill overlay (top-right of poster) in card/grid views, and inline as `year · library` in row-based lists (movie picker modal, artwork picker)
- Removed the duplicate library pill that was previously in the info section below the poster on `MovieCard`

---

## [0.2.5] — 2026-04-13

### Changed
- Collection artwork picker: left panel now shows the movies already in the collection instead of a TMDB search box; clicking a movie fetches its artwork from TMDB via the stored `tmdb_id`

---

## [0.2.4] — 2026-04-11

### Changed
- App logo replaced with VHS tape stack artwork; favicon and Apple touch icon generated from the same asset
- Sidebar wordmark updated to Oswald Bold, uppercase, with a left-to-right gradient (purple → teal → blue) matching the logo colours

---

## [0.2.3] — 2026-04-11

### Fixed
- Movie poster images were completely invisible — the fallback `<Film>` icon div was `absolute inset-0` and painted on top of the `<img>` tag, hiding it even when the image loaded successfully; now shows the image unless it actually errors, then falls back

### Changed
- Movies page now uses infinite scroll instead of a "Load more" button — next page loads automatically when you scroll within 200px of the bottom

---

## [0.2.2] — 2026-04-11

### Fixed
- Movies page was loading all 1200+ movies at once and firing a poster request for every single one simultaneously, saturating the browser's HTTP connection pool and starving other pages (e.g. Collections) of connections; added pagination (100 per page, "Load more" button) so only the first page of posters loads on arrival
- Added `loading="lazy"` to all movie poster `<img>` tags so off-screen posters don't fire until the user scrolls to them

### Changed
- `GET /api/movies` now accepts `limit` (default 100, max 500) and `offset` query params
- Movies page header now shows total library count from `/api/movies/count` independently of the current page

---

## [0.2.1] — 2026-04-11

### Fixed
- Collections page (and other pages) hung for 30 seconds then failed with a SQLAlchemy `QueuePool` timeout — loading ~20 movie posters in parallel saturated the default connection pool (size 5 + overflow 10 = 15 max) because each `async` poster endpoint held its DB connection open while awaiting the Jellyfin HTTP response; switched SQLite engine to `NullPool` so connections are never pooled and exhaustion is impossible

---

## [0.2.0] — 2026-04-11

### Added
- **Import from Jellyfin** — button on Collections page fetches all existing Jellyfin BoxSets and creates local collection records, so pre-existing collections are visible and manageable in JellyStacks
- **Jellyfin-native badge** — collections imported from Jellyfin show a distinct blue "Jellyfin" badge; JellyStacks-created collections that have been synced show "Synced" in green
- **Library filter on Movies page** — pill buttons let you filter the movie grid by Jellyfin library when multiple libraries are synced
- **Library filter in Add Movies modal** — same library pills available when picking movies to add to a collection
- **Library pill on movie cards** — each card shows the source Jellyfin library name below the title
- **Movie posters now display** — removed auth requirement from the poster proxy endpoint so `<img>` tags load without needing a bearer token
- **Artwork picker auto-searches** — opening "Change Artwork" now automatically runs a TMDB search using the collection name so results appear immediately without a manual submit
- **TMDB image proxy no longer requires auth** — `<img src="/api/tmdb/proxy-image?url=...">` now works in the browser without a bearer token

### Backend
- `GET /api/movies/{id}/poster` — removed `get_current_user` dependency
- `GET /api/tmdb/proxy-image` — removed `get_current_user` dependency
- `POST /api/collections/import-from-jellyfin` — new endpoint, imports BoxSets from Jellyfin
- `GET /api/movies/libraries` — new endpoint, returns distinct library names
- Movie sync now records `library_name` and `library_id` per movie; inline DB migration adds these columns safely
- Collection model and sync now track `is_jellyfin_native`; inline DB migration adds the column safely

---

## [0.1.4] — 2026-04-11

### Fixed
- Replaced `passlib[bcrypt]` with direct `bcrypt` calls — passlib 1.7.4 is incompatible with bcrypt 4.x and raised a `ValueError` during password hashing, breaking registration and login

---

## [0.1.3] — 2026-04-11

### Fixed
- docker-compose.yml now references the Docker Hub image instead of building locally

---

## [0.1.2] — 2026-04-11

### Changed
- Internal container port aligned to 7284 (Dockerfile EXPOSE and uvicorn CMD)

---

## [0.1.1] — 2026-04-11

### Changed
- Default host port changed from 8000 to 7284

---

## [0.1.0] — 2026-04-11

### Added
- Initial release of JellyStacks
- Jellyfin movie library sync (paginated, upserts into local SQLite DB)
- Collections CRUD — create, rename inline, add/remove movies, delete
- Push collections to Jellyfin as BoxSets (create or sync existing)
- Bulk push all collections to Jellyfin in one action
- Visual Jellyfin sync status badges on every collection card ("In Jellyfin" / "Local Only")
- Verify Jellyfin status — re-checks whether each collection still exists on the server
- Remove collection from Jellyfin without deleting the local record
- TMDB artwork picker — search movies, browse posters and backdrops, proxy images server-side
- Artwork uploaded to Jellyfin as PNG on collection push
- Movie poster proxy endpoint (keeps Jellyfin API key server-side)
- Form-based login with JWT auth (7-day tokens)
- First-run setup flow — detects no admin user and prompts to create one
- Settings page — Jellyfin URL, API key, User ID (with "Pick User" dropdown), TMDB API key, connection test
- Dockerized with multi-stage build (Node → Python) and named data volume
- Dark, responsive UI built with React 18, Vite, and Tailwind CSS
