from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import text, inspect as sa_inspect

from database import Base, engine
from routers import auth, movies, collections, settings as settings_router, tmdb

Base.metadata.create_all(bind=engine)

# ── Inline migrations: add new columns without dropping existing data ─────────
def _run_migrations():
    with engine.connect() as conn:
        inspector = sa_inspect(engine)

        movie_cols = {c["name"] for c in inspector.get_columns("movies")}
        for col, ddl in [
            ("library_name", "ALTER TABLE movies ADD COLUMN library_name TEXT"),
            ("library_id",   "ALTER TABLE movies ADD COLUMN library_id TEXT"),
        ]:
            if col not in movie_cols:
                conn.execute(text(ddl))

        col_cols = {c["name"] for c in inspector.get_columns("collections")}
        if "tmdb_collection_id" not in col_cols:
            conn.execute(text(
                "ALTER TABLE collections ADD COLUMN tmdb_collection_id TEXT"
            ))
        if "is_jellyfin_native" not in col_cols:
            conn.execute(text(
                "ALTER TABLE collections ADD COLUMN is_jellyfin_native BOOLEAN NOT NULL DEFAULT 0"
            ))

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

app = FastAPI(
    title="JellyStacks API",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
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
app.include_router(collections.router,     prefix="/api/collections", tags=["collections"])
app.include_router(settings_router.router, prefix="/api/settings",    tags=["settings"])
app.include_router(tmdb.router,            prefix="/api/tmdb",        tags=["tmdb"])

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
