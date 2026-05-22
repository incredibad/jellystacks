<p align="center">
  <img src=".github/logo.png" width="380" alt="JellyStacks" />
</p>

> [!WARNING]
> This project was built with AI assistance. Code may not meet production safety standards — review carefully before deploying in sensitive environments.
>
> **Note from the author:** This was made as a personal tool, and I'd like to share it with the community. I understand that AI can be both controversial and fallible. I have followed the AI coding and updates with security in mind, and have done multiple audits to try and find vulnerabilities and security leaks. However, there is always the risk of bad things happening — if you are security conscious or dubious, keep the app on your local network only, and/or behind a third-party auth app.

A self-hosted web app for managing your Jellyfin movie and TV collections. Sync your library, build and curate collections from multiple sources, design custom posters, and push everything back to Jellyfin as BoxSets — all from a clean dark UI.

## Screenshots

<!-- Add screenshots to .github/ and uncomment below -->
<!-- <img src=".github/collections.png" width="100%" alt="Collections" /> -->
<!-- <img src=".github/collection-detail.png" width="100%" alt="Collection detail" /> -->
<!-- <img src=".github/movies.png" width="100%" alt="Movies" /> -->

---

## Features

### Library
- **Jellyfin Library Sync** — Imports your full movie and TV show library from Jellyfin into a local database
- **Scheduled Library Sync** — Automatically re-imports from Jellyfin on a configurable interval (6h / 12h / 24h / weekly)
- **Multi-Library Support** — Movies and shows display their source Jellyfin library everywhere they appear
- **Grid & List Views** — Toggle between poster grid and compact list views on Movies, Shows, and Collections pages
- **Library Filtering** — Filter by Jellyfin library on Movies, Shows, and Collection detail pages
- **Mobile Responsive** — Full mobile layout including a collapsible sidebar

### Collections
- **Collection Management** — Create, rename, and curate collections; add or remove movies and shows
- **Import from TMDB** — Search TMDB franchise collections, preview owned/unowned parts, import in one click
- **Import from MDBList** — Search any public MDBList list, see how many items you own, create a pre-populated collection
- **Import from Trakt** — Browse trending or search public Trakt lists and import as a managed collection
- **Import from Jellyfin** — Pull existing Jellyfin BoxSets into JellyStacks
- **Push to Jellyfin** — Syncs collections to Jellyfin as BoxSets with a single click; bulk-push all at once
- **Scheduled Collection Refresh** — Managed collections (TMDB / MDBList / Trakt) are automatically re-scanned for new library items on a configurable interval
- **Smart Suggestions** — Scores your entire library against the collection name using tags, cast, genres, and metadata to suggest relevant titles
- **Related Movies** — Fetches TMDB recommendations based on movies already in the collection, ranked by frequency
- **Sync Status Badges** — Every collection shows its Jellyfin state: In Jellyfin, Needs Sync, or Local Only
- **Source Links** — TMDB, MDBList, and Trakt pills on the collection detail page link directly to the source list

### Artwork
- **Artwork Picker** — Browse and select posters from TMDB (movies/shows) and TheTVDB (TV shows/anime)
- **Custom Artwork Upload** — Upload your own poster for any movie, show, or collection
- **Bulk Artwork Upload** — Drop a folder of images or a ZIP; JellyStacks fuzzy-matches filenames to titles and applies in bulk
- **Poster Studio** — Full canvas poster designer with text, image, vignette, and line layers; 20 curated Google Fonts; AI background generation via Pollinations.ai; apply designs directly to any movie, show, or collection
- **Artwork pushed to Jellyfin** — Custom artwork is uploaded to Jellyfin on push

### System
- **Sync Log** — Console-style log of the most recent library sync, colour-coded by event type, viewable in Settings → System
- **Application Log** — Live backend log viewer (last 500 lines) with download button, in Settings → System
- **Backup & Restore** — Export and import a full backup zip (database + artwork) from Settings
- **First-Run Setup** — Detects no admin user on first launch and prompts to create one

---

## Installation

### Docker Compose (recommended)

Create a `docker-compose.yml` with the following content:

```yaml
services:
  jellystacks:
    image: incredibad/jellystacks:latest
    container_name: jellystacks
    ports:
      - "7284:7284"
    volumes:
      - jellystacks_data:/data
    environment:
      - SECRET_KEY=${SECRET_KEY:-change-this-secret-key-in-production}
      - DATABASE_URL=sqlite:////data/jellystacks.db
      - TZ=Australia/Brisbane   # set your local timezone for log timestamps
    restart: unless-stopped

volumes:
  jellystacks_data:
```

Then run:

```bash
docker compose up -d
```

### Docker Run

```bash
docker run -d \
  --name jellystacks \
  --restart unless-stopped \
  -p 7284:7284 \
  -v jellystacks_data:/data \
  -e SECRET_KEY=change-this-secret-key-in-production \
  -e DATABASE_URL=sqlite:////data/jellystacks.db \
  -e TZ=Australia/Brisbane \
  incredibad/jellystacks:latest
```

Open **http://your-server:7284** — you'll be prompted to create an admin account.

### Updating

```bash
docker compose pull && docker compose up -d
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | **Yes** | Random secret used to sign auth tokens — change this |
| `DATABASE_URL` | No | SQLite path — defaults to `sqlite:////data/jellystacks.db` |
| `TZ` | No | Timezone for log timestamps, e.g. `Australia/Brisbane`, `Europe/London` |

---

## First-Run Setup

1. Open the app and create your admin account
2. Go to **Settings → Sync** and enter your Jellyfin credentials:

| Setting | Where to find it |
|---|---|
| Jellyfin URL | e.g. `http://your-server:8096` |
| Jellyfin API Key | Jellyfin → Dashboard → API Keys |
| Jellyfin User ID | Settings → Pick User (fetched automatically) |

3. Go to **Settings → Providers** to configure optional integrations:

| Setting | Where to find it |
|---|---|
| TMDB API Key | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (free) — enables franchise import, artwork, and suggestions |
| MDBList API Key | [mdblist.com/preferences](https://mdblist.com/preferences) (free) — enables MDBList collection import |
| Trakt Client ID | [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications) (free) — enables Trakt list import |
| TheTVDB API Key | [thetvdb.com/dashboard](https://thetvdb.com/dashboard) (free) — enables TV show artwork from TheTVDB |

4. Click **Sync Library** in the sidebar to import your movies and shows
5. Go to **Collections** and create your first collection

---

## Data Persistence

| Path in volume | Contents |
|---|---|
| `jellystacks.db` | SQLite database (collections, movies, shows, settings) |
| `artwork/` | Custom artwork uploaded via the UI |
| `sync_log.json` | Structured log of the most recent library sync (survives restarts) |
| `sync.log` | Human-readable sync log, overwritten on each sync |
| `app.log` | Rotating application log (2 MB, 2 backups) |

All paths live inside the `jellystacks_data` volume and survive `docker compose pull && docker compose up -d` updates.

---

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite, httpx
- **Frontend**: React 18, React Router, Vite, Tailwind CSS, Lucide icons, Konva / react-konva
- **APIs**: Jellyfin REST API, TMDB v3, MDBList API, Trakt API, TheTVDB API, Pollinations.ai (AI image generation)

## License

MIT — see [LICENSE](LICENSE)
