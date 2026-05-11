"""
Core refresh logic for managed (TMDB / MDBList) collections.

Called by both the scheduler and the manual POST /collections/refresh-managed
endpoint so the logic lives in exactly one place.
"""
import logging
from datetime import datetime

import httpx
from sqlalchemy.orm import Session, selectinload

import models
from routers.mdblist import _split_raw_response

logger = logging.getLogger("refresh")

_TMDB_BASE = "https://api.themoviedb.org/3"
_MDBLIST_BASE = "https://api.mdblist.com"


async def _refresh_tmdb(col: models.Collection, api_key: str, db: Session) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_TMDB_BASE}/collection/{col.tmdb_collection_id}",
            params={"api_key": api_key},
        )
    if resp.status_code != 200:
        return {"ok": False, "error": f"TMDB HTTP {resp.status_code}"}

    data = resp.json()
    parts = data.get("parts", [])
    tmdb_ids = [str(p["id"]) for p in parts]

    owned = db.query(models.Movie).filter(models.Movie.tmdb_id.in_(tmdb_ids)).all() if tmdb_ids else []

    current_ids = {m.id for m in col.movies}
    new_ids = {m.id for m in owned}
    col.movies = owned
    col.tmdb_total_parts = len(parts)
    if current_ids != new_ids:
        col.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "movies": len(owned), "total": len(parts)}


async def _refresh_mdblist(col: models.Collection, api_key: str, db: Session) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_MDBLIST_BASE}/lists/{col.mdblist_list_id}/items",
            params={"apikey": api_key},
        )
    if resp.status_code != 200:
        return {"ok": False, "error": f"MDBList HTTP {resp.status_code}"}

    movie_ids, show_ids, total, *_ = _split_raw_response(resp.json())

    movies = db.query(models.Movie).filter(models.Movie.tmdb_id.in_(movie_ids)).all() if movie_ids else []
    shows = db.query(models.Show).filter(models.Show.tmdb_id.in_(show_ids)).all() if show_ids else []

    current_movie_ids = {m.id for m in col.movies}
    current_show_ids = {s.id for s in col.shows}
    col.movies = movies
    col.shows = shows
    col.mdblist_total_items = total
    if {m.id for m in movies} != current_movie_ids or {s.id for s in shows} != current_show_ids:
        col.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "movies": len(movies), "shows": len(shows), "total": total}


async def refresh_all_managed(db: Session, tmdb_key: str | None, mdb_key: str | None) -> dict:
    """Refresh every TMDB and MDBList collection. Returns summary counts."""
    cols = (
        db.query(models.Collection)
        .filter(
            (models.Collection.tmdb_collection_id.isnot(None)) |
            (models.Collection.mdblist_list_id.isnot(None))
        )
        .options(
            selectinload(models.Collection.movies),
            selectinload(models.Collection.shows),
        )
        .all()
    )

    refreshed = 0
    failed = 0
    skipped = 0

    for col in cols:
        try:
            if col.tmdb_collection_id:
                if not tmdb_key:
                    skipped += 1
                    continue
                result = await _refresh_tmdb(col, tmdb_key, db)
            else:
                if not mdb_key:
                    skipped += 1
                    continue
                result = await _refresh_mdblist(col, mdb_key, db)

            if result.get("ok"):
                refreshed += 1
            else:
                logger.warning("Refresh failed for collection %d (%s): %s", col.id, col.name, result.get("error"))
                failed += 1
        except Exception:
            logger.exception("Unhandled error refreshing collection %d (%s)", col.id, col.name)
            failed += 1

    return {"refreshed": refreshed, "failed": failed, "skipped": skipped}
