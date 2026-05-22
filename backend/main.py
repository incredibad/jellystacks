from contextlib import asynccontextmanager
import logging
import logging.handlers
from pathlib import Path
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from sqlalchemy import text, inspect as sa_inspect

# ── Application-level log file ────────────────────────────────────────────────
_LOG_FILE = Path("/data/app.log")
_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
_file_handler = logging.handlers.RotatingFileHandler(
    _LOG_FILE, maxBytes=2 * 1024 * 1024, backupCount=2, encoding="utf-8"
)
_file_handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s"))
logging.getLogger().addHandler(_file_handler)
logging.getLogger().setLevel(logging.INFO)

from database import Base, engine, SessionLocal
import models
from auth import get_current_user
from routers import auth, movies, collections, settings as settings_router, tmdb, shows as shows_router, mdblist as mdblist_router, trakt as trakt_router, tvdb as tvdb_router, bulk_artwork as bulk_artwork_router, poster_projects as poster_projects_router
import scheduler as collection_scheduler
import sync_log as _sync_log

Base.metadata.create_all(bind=engine)

# ── Inline migrations: add new columns without dropping existing data ─────────
def _run_migrations():
    with engine.connect() as conn:
        inspector = sa_inspect(engine)

        movie_cols = {c["name"] for c in inspector.get_columns("movies")}
        for col, ddl in [
            ("library_name", "ALTER TABLE movies ADD COLUMN library_name TEXT"),
            ("library_id",   "ALTER TABLE movies ADD COLUMN library_id TEXT"),
            ("tags",         "ALTER TABLE movies ADD COLUMN tags TEXT"),
            ("people",       "ALTER TABLE movies ADD COLUMN people TEXT"),
        ]:
            if col not in movie_cols:
                conn.execute(text(ddl))
        if "custom_artwork_url" not in movie_cols:
            conn.execute(text("ALTER TABLE movies ADD COLUMN custom_artwork_url TEXT"))

        show_cols = {c["name"] for c in inspector.get_columns("shows")}
        if "custom_artwork_url" not in show_cols:
            conn.execute(text("ALTER TABLE shows ADD COLUMN custom_artwork_url TEXT"))
        if "tvdb_id" not in show_cols:
            conn.execute(text("ALTER TABLE shows ADD COLUMN tvdb_id TEXT"))

        col_cols = {c["name"] for c in inspector.get_columns("collections")}
        if "tmdb_collection_id" not in col_cols:
            conn.execute(text(
                "ALTER TABLE collections ADD COLUMN tmdb_collection_id TEXT"
            ))
        if "tmdb_checked" not in col_cols:
            conn.execute(text(
                "ALTER TABLE collections ADD COLUMN tmdb_checked BOOLEAN NOT NULL DEFAULT 0"
            ))
        if "tmdb_total_parts" not in col_cols:
            conn.execute(text(
                "ALTER TABLE collections ADD COLUMN tmdb_total_parts INTEGER"
            ))
        if "is_jellyfin_native" not in col_cols:
            conn.execute(text(
                "ALTER TABLE collections ADD COLUMN is_jellyfin_native BOOLEAN NOT NULL DEFAULT 0"
            ))
        if "mdblist_list_id" not in col_cols:
            conn.execute(text("ALTER TABLE collections ADD COLUMN mdblist_list_id INTEGER"))
        if "mdblist_total_items" not in col_cols:
            conn.execute(text("ALTER TABLE collections ADD COLUMN mdblist_total_items INTEGER"))
        if "trakt_list_id" not in col_cols:
            conn.execute(text("ALTER TABLE collections ADD COLUMN trakt_list_id INTEGER"))
        if "trakt_total_items" not in col_cols:
            conn.execute(text("ALTER TABLE collections ADD COLUMN trakt_total_items INTEGER"))
        if "source_url" not in col_cols:
            conn.execute(text("ALTER TABLE collections ADD COLUMN source_url TEXT"))

        # One-time fix: native collections imported before v0.2.22 have updated_at
        # a few microseconds ahead of jellyfin_synced_at due to SQLAlchemy insert
        # timing — pin jellyfin_synced_at = updated_at where the gap is < 1 second.
        conn.execute(text("""
            UPDATE collections
            SET jellyfin_synced_at = updated_at
            WHERE is_jellyfin_native = 1
              AND jellyfin_synced_at IS NOT NULL
              AND updated_at IS NOT NULL
              AND julianday(updated_at) > julianday(jellyfin_synced_at)
              AND julianday(updated_at) - julianday(jellyfin_synced_at) < 1.15741e-5
        """))

        conn.commit()

_run_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    collection_scheduler.start(SessionLocal)
    yield
    collection_scheduler.stop()


app = FastAPI(
    title="JellyStacks API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Routes ────────────────────────────────────────────────────────────────
app.include_router(auth.router,            prefix="/api/auth",        tags=["auth"])
app.include_router(movies.router,          prefix="/api/movies",      tags=["movies"])
app.include_router(shows_router.router,    prefix="/api/shows",       tags=["shows"])
app.include_router(collections.router,     prefix="/api/collections", tags=["collections"])
app.include_router(settings_router.router, prefix="/api/settings",    tags=["settings"])
app.include_router(tmdb.router,            prefix="/api/tmdb",        tags=["tmdb"])
app.include_router(mdblist_router.router,  prefix="/api/mdblist",     tags=["mdblist"])
app.include_router(trakt_router.router,    prefix="/api/trakt",       tags=["trakt"])
app.include_router(tvdb_router.router,          prefix="/api/tvdb",         tags=["tvdb"])
app.include_router(bulk_artwork_router.router,      prefix="/api/artwork/bulk",     tags=["artwork"])
app.include_router(poster_projects_router.router,  prefix="/api/poster-projects",  tags=["poster-studio"])

# ── Sync Log ─────────────────────────────────────────────────────────────────
@app.get("/api/sync/log", include_in_schema=True)
async def get_sync_log(user: models.User = Depends(get_current_user)):
    log = _sync_log.get_latest(user.id)
    if log is None:
        return JSONResponse(status_code=404, content={"detail": "No sync log available"})
    return log


# ── Application Log ───────────────────────────────────────────────────────────
@app.get("/api/logs", include_in_schema=True)
async def get_app_log(_: models.User = Depends(get_current_user)):
    if not _LOG_FILE.exists():
        return {"lines": []}
    text_content = _LOG_FILE.read_text(encoding="utf-8", errors="replace")
    lines = text_content.splitlines()
    return {"lines": lines[-500:]}


# ── Static Frontend ───────────────────────────────────────────────────────────
static_dir = Path("/app/static")
dev_static = Path(__file__).parent / "static"
serving_dir = static_dir if static_dir.exists() else (dev_static if dev_static.exists() else None)

if serving_dir:
    assets_dir = serving_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        candidate = serving_dir / full_path
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        index = serving_dir / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return HTMLResponse("<h1>JellyStacks frontend not built.</h1>", status_code=503)
else:
    @app.get("/", include_in_schema=False)
    async def root():
        return HTMLResponse("<h1>JellyStacks</h1><p>Frontend not built yet.</p>")
