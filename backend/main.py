from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

from database import Base, engine
from routers import auth, movies, collections, settings as settings_router, tmdb

# Create all DB tables on startup
Base.metadata.create_all(bind=engine)

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

# ── API Routes (must be registered before SPA catch-all) ──────────────────────
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(movies.router, prefix="/api/movies", tags=["movies"])
app.include_router(collections.router, prefix="/api/collections", tags=["collections"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
app.include_router(tmdb.router, prefix="/api/tmdb", tags=["tmdb"])

# ── Static Frontend (React build) ─────────────────────────────────────────────
static_dir = Path("/app/static")
dev_static_dir = Path(__file__).parent / "static"
serving_dir = static_dir if static_dir.exists() else (dev_static_dir if dev_static_dir.exists() else None)

if serving_dir:
    assets_dir = serving_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Try to serve an exact file match first
        candidate = serving_dir / full_path
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        # Fall back to index.html for client-side routing
        index = serving_dir / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return HTMLResponse("<h1>JellyStacks frontend not built yet.</h1>", status_code=503)
else:
    @app.get("/", include_in_schema=False)
    async def root():
        return HTMLResponse(
            "<h1>JellyStacks</h1><p>Frontend not built. Run <code>npm run build</code> in "
            "the <code>frontend/</code> directory or use Docker.</p>"
        )
