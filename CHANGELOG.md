# Changelog

All notable changes are documented here, newest first.

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
