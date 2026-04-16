# Changelog

All notable changes are documented here, newest first.

---

## [1.3.7] — 2026-04-16

### Changed
- Updated all collection status badges (Needs Sync, Jellyfin, Synced, Local, Custom) to use maximally distinct solid colours for partial colour-blindness accessibility: orange-600, blue-700, teal-600, slate-500, amber-500
- Applied consistent badge colours to both the collection card posters and the collection detail page header

---

## [1.3.6] — 2026-04-16

### Changed
- Sync status badges on collection cards (Needs Sync, Jellyfin, Synced, Local) updated to solid fills with white text to match the TMDB/Custom badge style

---

## [1.3.5] — 2026-04-16

### Added
- Progress bar toast in the bottom-right corner during bulk operations — shows current/total count with an animated violet progress bar
- Detect TMDB, Verify Status, and Push All now run per-collection on the frontend so progress can be tracked in real time

---

## [1.3.4] — 2026-04-16

### Changed
- TMDB/Custom badge on collection cards only appears after detection has confirmed the status — unscanned collections show no badge
- Badge colours updated to solid fills: violet for TMDB, sky blue for Custom (no more translucent grey)
- TMDB collection cards show movie count as `owned/total` format (e.g. "4/8 movies")
- New DB columns: `tmdb_checked` (detection has run), `tmdb_total_parts` (franchise size)

---

## [1.3.3] — 2026-04-16

### Changed
- Collections header actions consolidated into a single "Operations" dropdown (Import from Jellyfin, Verify Status, Detect TMDB, Push All); "New Collection" remains a standalone button

---

## [1.3.2] — 2026-04-16

### Added
- "Detect TMDB" bulk scan button on the Collections page — runs detection across all collections at once and reports how many were linked, marked Custom, or skipped
- `POST /collections/detect-tmdb-all` backend endpoint

### Changed
- TMDB/Custom badge moved to top-right of the collection poster on the cards list view for better visibility

---

## [1.3.1] — 2026-04-16

### Changed
- TMDB collection detection now re-runs on every page load — if a movie is added that breaks the match, the collection reverts to Custom automatically
- Stale TMDB links are cleared in the DB whenever detection fails
- "Custom Collection" badge now shown on the collection detail page once detection has completed and no TMDB match was found

---

## [1.3.0] — 2026-04-16

### Added
- Collections are now auto-detected as **TMDB Collections** — when all owned movies belong to the same TMDB franchise collection and every owned movie is confirmed in that TMDB list, the collection is linked automatically and shown with a "TMDB Collection" badge
- Collection detail page shows a **"Not in your library"** section for movies that are part of the TMDB collection but not in your Jellyfin library, with posters, titles, and release years
- TMDB badge shown on collection cards in the list view when a collection is TMDB-linked
- New backend endpoints: `POST /collections/{id}/detect-tmdb` and `GET /collections/{id}/unowned`

---

## [1.2.2] — 2026-04-16

### Fixed
- Backup import failed with "Invalid cross-device link" — temp file is now written to the same directory as the database instead of `/tmp`

---

## [1.2.1] — 2026-04-16

### Changed
- Settings page split into four tabs: Sync, Account, Backup, System

---

## [1.2.0] — 2026-04-16

### Added
- Settings page now has **Sync** and **System** tabs
- **Sync tab**: Jellyfin server configuration and TMDB integration (previously the only content)
- **System tab**: password change, data backup export/import (zip archive), and Danger Zone
- `POST /auth/change-password` — authenticated password change endpoint
- `GET /settings/export` — downloads a zip of the full SQLite database for easy migration
- `POST /settings/import` — restores from an exported backup zip, replacing all current data

---

## [1.1.3] — 2026-04-16

### Fixed
- Movies with multiple files in Jellyfin no longer appear as duplicates — the API now deduplicates by (title, year, library) so only one entry per movie is shown, both on the Movies page and in the collection movie picker. Movies with the same title across different libraries are still shown separately.

---

## [1.1.2] — 2026-04-16

### Changed
- "Import from Jellyfin" and "Push All" buttons now show a confirmation modal explaining what the action does before executing

---

## [1.1.1] — 2026-04-16

### Changed
- Collections list now sorts alphabetically while ignoring leading articles ("the", "a", "an")

---

## [1.1.0] — 2026-04-15

### Added
- **Related Collections artwork source** — the artwork picker now shows a "Related Collections" item at the top of the movie list; clicking it queries TMDB's collection API for every movie in the collection, deduplicates the results, and displays official TMDB collection posters grouped by collection name in the right pane

---

## [1.0.2] — 2026-04-15

### Changed
- Collection detail page now silently verifies Jellyfin sync status on load (if the collection has been pushed), keeping the "In Jellyfin" / "Local Only" badge up-to-date without requiring a manual Verify click

---

## [1.0.1] — 2026-04-13

### Fixed
- Deleting a collection now also removes it from Jellyfin (best-effort — local delete always succeeds even if Jellyfin is unreachable); updated confirm dialog text to reflect this
- Context menu (three-dot) on collection cards was being clipped by `overflow-hidden` on the card root; moved `overflow-hidden` to the artwork div only and added `rounded-t-xl` to preserve the corner rounding

---

## [1.0.0] — 2026-04-13

### Changed
- Version bump to 1.0.0 — first stable public release

---

## [0.2.27] — 2026-04-13

### Added
- `README.md` with project description, features, Docker Compose and Docker Run install instructions, first-run setup table, data persistence notes, and tech stack

---

## [0.2.26] — 2026-04-13

### Added
- Collection detail page shows a blue **Imported from Jellyfin** badge for `is_jellyfin_native` collections, alongside the existing sync-state badge
- App version displayed in the sidebar footer beneath the Sign out button

---

## [0.2.25] — 2026-04-13

### Fixed
- "Clear Jellyfin Collections" caused a blank page crash — `DELETE /collections/jellyfin-native` was registered after `DELETE /collections/{collection_id}`, so FastAPI matched the literal path against the int parameter first, returned a Pydantic 422 error object, and `toast.error()` tried to render it as a React child (error #31); fixed by moving the `/jellyfin-native` route before the parameterised route, and hardening the error handler to never pass non-string values to toast

---

## [0.2.24] — 2026-04-13

### Fixed
- Existing Jellyfin-imported collections still showed "Needs Sync" after v0.2.22 — the flush/pin fix only applied to new imports; added a startup migration that runs a SQL UPDATE to equalise `jellyfin_synced_at` with `updated_at` for any native collection where the gap is under 1 second (pure insert-time drift)

### Added
- Settings → Danger Zone: **Clear Jellyfin Collections** button removes all Jellyfin-imported collections from the local database so they can be re-imported fresh (nothing is deleted from Jellyfin)
- `DELETE /api/collections/jellyfin-native` backend endpoint

---

## [0.2.23] — 2026-04-13

### Fixed
- Add Movies modal only showed movies up to the default page limit (100) — with 1200+ movies the list stopped mid-alphabet; replaced the single bulk fetch with infinite scroll using an `IntersectionObserver` sentinel, loading 75 movies at a time as the user scrolls; search and library filter reset the list and restart from page 1

---

## [0.2.22] — 2026-04-13

### Fixed
- Imported Jellyfin collections still showed "Needs Sync" despite the v0.2.19 fix — SQLAlchemy evaluates `default=datetime.utcnow` at INSERT time (not construction time), so `updated_at` was always set a few microseconds after `jellyfin_synced_at` regardless of the value passed to the constructor; fixed by flushing the INSERT first so SQLAlchemy populates `updated_at`, then setting `jellyfin_synced_at = col.updated_at` (guaranteed identical value)
- Import now also repairs existing native collections whose `updated_at` is less than 1 second ahead of `jellyfin_synced_at` (pure timing drift from earlier imports), so running "Import from Jellyfin" again clears the false Needs Sync on already-imported collections

---

## [0.2.21] — 2026-04-13

### Fixed
- Collections "Local" filter always showed 0 when all JellyStacks collections had been pushed — the filter was keying on `in_jellyfin` (sync state) instead of `is_jellyfin_native` (origin); now "Local" shows JellyStacks-created collections and "From Jellyfin" shows imported ones, regardless of sync status

---

## [0.2.20] — 2026-04-13

### Fixed
- Collection detail page showed "No artwork" for Jellyfin-imported collections — the detail view only checked `artwork_url` (null for imports); now tries the Jellyfin poster proxy first and falls back to the TMDB URL, matching the behaviour of the collections grid

---

## [0.2.19] — 2026-04-13

### Fixed
- Imported Jellyfin collections incorrectly showed "Needs Sync" immediately after import — `updated_at` was being set by SQLAlchemy's INSERT-time default (a few microseconds after `jellyfin_synced_at` was captured), making the timestamp comparison always true; import now uses the same `datetime.utcnow()` value for both fields so a freshly imported collection reads as "In Jellyfin" unless the user explicitly modifies it

---

## [0.2.18] — 2026-04-13

### Changed
- Creating a new collection now navigates directly to its detail/edit page instead of returning to the collections grid

---

## [0.2.17] — 2026-04-13

### Added
- Collections screen filter pills: **All / In Jellyfin / Local** — narrows the visible list without leaving the page
- Grid/list view toggle on Collections page (preference persisted to `localStorage` as `jellystacks:collections-view`)
- New `CollectionListRow` component: horizontal row with mini poster, name, description, movie count, and status badge
- `GET /api/collections/{id}/poster` — backend proxy that fetches the collection image directly from Jellyfin, so the browser never needs an API key
- `CollectionCard` and `CollectionListRow` now prefer the Jellyfin poster (via the new proxy) and fall back to the TMDB `artwork_url`; if the Jellyfin fetch fails the TMDB image is used instead
- **Needs Sync** amber badge now appears on `CollectionCard` (grid view) as well as the detail page, matching the same `updated_at > jellyfin_synced_at` logic

---

## [0.2.16] — 2026-04-13

### Fixed
- Artwork upload HTTP 500: replaced raw byte upload (`POST /Items/{id}/Images/Primary/0`) with Jellyfin's `POST /Items/{id}/RemoteImages/Download` — Jellyfin fetches the image from TMDB itself using its own image pipeline, avoiding the upload endpoint that returns 500 on this configuration

---

## [0.2.15] — 2026-04-13

### Fixed
- Artwork upload HTTP 500 (continued): switched from `/original/` to `/w500/` TMDB image size to reduce payload size; use a dedicated `httpx` client for the upload rather than the shared Jellyfin session client; added a 1-second delay after collection creation before uploading artwork, as Jellyfin's BoxSet creation is partially asynchronous and an immediate image POST can hit internal state that isn't ready

---

## [0.2.14] — 2026-04-13

### Changed
- Login screen logo updated to match the sidebar: `logo.png` image + Oswald Bold uppercase gradient wordmark (purple → teal → blue) replacing the generic icon and plain white text

---

## [0.2.13] — 2026-04-13

### Fixed
- Duplicate collections on rename: the "stale" fallback path cleared `jellyfin_collection_id` locally but never deleted the old Jellyfin collection, leaving it orphaned; old ID is now always deleted from Jellyfin before recreating, regardless of whether the GET check succeeded or failed
- Artwork HTTP 500: Jellyfin's image upload endpoint requires an explicit index — corrected URL from `/Images/Primary` to `/Images/Primary/0`

---

## [0.2.12] — 2026-04-13

### Fixed
- Artwork upload HTTP 500: removed Pillow PNG re-encoding and the redundant `api_key` query param; image is now uploaded directly from TMDB using its original content-type (JPEG), which Jellyfin accepts without error
- Rename still created a duplicate collection: push endpoint's existence check was missing `UserId` (causing non-200 responses on some Jellyfin setups, which cleared the stored ID and triggered a fresh create); also replaced unreliable `POST /Items/{id}` rename with a delete-then-recreate strategy — the old Jellyfin collection is deleted and a new one is created with the updated name

---

## [0.2.11] — 2026-04-13

### Fixed
- Renaming a collection in JellyStacks then syncing created a duplicate Jellyfin collection instead of updating the existing one — caused by two separate bugs:
  1. The Jellyfin existence check used an `httpx` client without `follow_redirects=True`, so a redirect response was misread as "collection gone" and a new one was created
  2. The sync path never updated the collection name in Jellyfin — now sends `POST /Items/{id}` with the updated name when it differs from what Jellyfin has

---

## [0.2.10] — 2026-04-13

### Changed
- Push button now shows **Synced** (greyed out, disabled) when the collection is up to date in Jellyfin; only active when there is actually work to do (needs sync or not yet pushed)

### Fixed
- Artwork upload now also passes `api_key` as a query parameter to Jellyfin (some instances require it for write endpoints in addition to the `Authorization` header)
- Artwork upload failures are no longer silently swallowed — any error is appended to the push result toast message so the cause is visible
- `_upload_artwork` now returns an error string on failure instead of `pass`-ing exceptions

---

## [0.2.9] — 2026-04-13

### Fixed
- Verify button was resetting `in_jellyfin` to false on any non-200 response (including redirects and transient errors); now only 200 → confirmed in Jellyfin, 404 → confirmed gone, anything else leaves state unchanged
- Verify now follows HTTP redirects (`follow_redirects=True`) and includes `UserId` if configured, matching how other Jellyfin calls are authenticated

### Added
- Three-way Jellyfin status badge on collection detail: **In Jellyfin** (green), **Needs Sync** (amber), **Local Only** (grey)
- "Needs Sync" state is derived from `updated_at > jellyfin_synced_at` — any local change after the last push (movies added/removed, name, description, artwork) triggers it automatically
- Push button turns amber and reads "Update in Jellyfin" when the collection needs syncing

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
