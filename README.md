<p align="center">
  <img src=".github/logo.png" width="380" alt="JellyStacks" />
</p>

> [!WARNING]
> This project was built with AI assistance. Code may not meet production safety standards — review carefully before deploying in sensitive environments.
>
> **Note from the author:** This was made as a personal tool, and I'd like to share it with the community. I understand that AI can be both controversial and fallible. I have followed the AI coding and updates with security in mind, and have done multiple audits to try and find vulnerabilities and security leaks. However, there is always the risk of bad things happening — if you are security conscious or dubious, keep the app on your local network only, and/or behind a third-party auth app.

A self-hosted web app for managing your Jellyfin movie collections. Sync your library, build and curate collections, pick artwork from TMDB, and push everything back to Jellyfin as BoxSets — all from a clean dark UI.

## Screenshots

<!-- Add screenshots to .github/ and uncomment below -->
<!-- <img src=".github/collections.png" width="100%" alt="Collections" /> -->
<!-- <img src=".github/collection-detail.png" width="100%" alt="Collection detail" /> -->
<!-- <img src=".github/movies.png" width="100%" alt="Movies" /> -->

---

## Features

- **Jellyfin Library Sync** — Imports your full movie library from Jellyfin into a local database
- **Collection Management** — Create, rename, and curate collections; add or remove movies with a searchable picker
- **Push to Jellyfin** — Syncs collections to Jellyfin as BoxSets with a single click; bulk-push all at once
- **Import from Jellyfin** — Pull existing Jellyfin BoxSets into JellyStacks so they're visible and manageable
- **Artwork Picker** — Browse and select posters and backdrops from TMDB; artwork is uploaded to Jellyfin on push
- **Sync Status Badges** — Every collection shows its Jellyfin state: In Jellyfin, Needs Sync, or Local Only
- **Grid & List Views** — Toggle between poster grid and compact list views on Movies and Collections pages
- **Library Filtering** — Filter movies and collections by Jellyfin library
- **Multi-Library Support** — Movies display their source library everywhere they appear
- **First-Run Setup** — Detects no admin user on first launch and prompts to create one
- **Clean UI** — Dark, responsive interface built with React 18, Vite, and Tailwind CSS

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
      - SECRET_KEY=change-this-to-a-random-secret
      - DATABASE_URL=sqlite:////data/jellystacks.db
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
  -e SECRET_KEY=change-this-to-a-random-secret \
  -e DATABASE_URL=sqlite:////data/jellystacks.db \
  incredibad/jellystacks:latest
```

Open **http://your-server:7284** — you'll be prompted to create an admin account.

### Updating

```bash
docker compose pull && docker compose up -d
```

---

## First-Run Setup

1. Open the app and create your admin account
2. Go to **Settings** and enter your credentials:

| Setting | Where to find it |
|---|---|
| Jellyfin URL | e.g. `http://your-server:8096` |
| Jellyfin API Key | Jellyfin → Dashboard → API Keys |
| Jellyfin User ID | Settings → Pick User (fetched automatically) |
| TMDB API Key | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (free) |

3. Click **Sync Library** in the sidebar to import your movies
4. Go to **Collections** and create your first collection
5. Add movies, pick artwork, and push to Jellyfin

---

## Data Persistence

| Volume | Contents |
|---|---|
| `jellystacks_data` | SQLite database and application data |

The volume survives `docker compose pull && docker compose up -d` updates.

---

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite, httpx
- **Frontend**: React 18, React Router, Vite, Tailwind CSS, Lucide icons
- **APIs**: Jellyfin REST API, TMDB v3

## License

MIT — see [LICENSE](LICENSE)
