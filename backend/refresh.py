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
_TRAKT_BASE = "https://api.trakt.tv"


async def _push_membership(col: models.Collection, jf_url: str, jf_key: str, db: Session) -> None:
    """Sync collection membership to an already-existing Jellyfin collection."""
    from routers.collections import _jellyfin_headers

    headers = _jellyfin_headers(jf_key)
    base = jf_url.rstrip("/")
    jf_col_id = col.jellyfin_collection_id

    movie_jf_ids = [m.jellyfin_id for m in col.movies if m.jellyfin_id]
    show_jf_ids = [s.jellyfin_id for s in col.shows if s.jellyfin_id]
    wanted = set(movie_jf_ids + show_jf_ids)

    async with httpx.AsyncClient(timeout=20) as client:
        items_resp = await client.get(
            f"{base}/Items",
            headers=headers,
            params={"ParentId": jf_col_id, "IncludeItemTypes": "Movie,Series",
                    "Recursive": "true", "Fields": "Id", "Limit": 1000},
        )
        current_ids: set[str] = set()
        if items_resp.status_code == 200:
            current_ids = {item["Id"] for item in items_resp.json().get("Items", [])}

        to_remove = current_ids - wanted
        to_add = wanted - current_ids

        if to_remove:
            await client.delete(
                f"{base}/Collections/{jf_col_id}/Items",
                headers=headers,
                params={"ids": ",".join(to_remove)},
            )
        if to_add:
            await client.post(
                f"{base}/Collections/{jf_col_id}/Items",
                headers=headers,
                params={"ids": ",".join(to_add)},
            )

    col.jellyfin_synced_at = datetime.utcnow()
    db.commit()


async def _refresh_tmdb(col: models.Collection, api_key: str, db: Session,
                        jf_url: str | None = None, jf_key: str | None = None) -> dict:
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
    changed = current_ids != new_ids
    col.movies = owned
    col.tmdb_total_parts = len(parts)
    if changed:
        col.updated_at = datetime.utcnow()
    db.commit()

    if changed and col.in_jellyfin and col.jellyfin_collection_id and jf_url and jf_key:
        try:
            await _push_membership(col, jf_url, jf_key, db)
            logger.info("Auto-pushed membership for collection %d (%s) to Jellyfin", col.id, col.name)
        except Exception:
            logger.warning("Auto-push to Jellyfin failed for collection %d (%s)", col.id, col.name, exc_info=True)

    return {"ok": True, "movies": len(owned), "total": len(parts)}


async def _refresh_mdblist(col: models.Collection, api_key: str, db: Session,
                           jf_url: str | None = None, jf_key: str | None = None) -> dict:
    from routers.mdblist import _fetch_all_items
    all_items = await _fetch_all_items(col.mdblist_list_id, api_key)
    movie_ids, show_ids, total, *_ = _split_raw_response(all_items)

    movies = db.query(models.Movie).filter(models.Movie.tmdb_id.in_(movie_ids)).all() if movie_ids else []
    shows = db.query(models.Show).filter(models.Show.tmdb_id.in_(show_ids)).all() if show_ids else []

    current_movie_ids = {m.id for m in col.movies}
    current_show_ids = {s.id for s in col.shows}
    changed = {m.id for m in movies} != current_movie_ids or {s.id for s in shows} != current_show_ids
    col.movies = movies
    col.shows = shows
    col.mdblist_total_items = total
    if changed:
        col.updated_at = datetime.utcnow()
    db.commit()

    if changed and col.in_jellyfin and col.jellyfin_collection_id and jf_url and jf_key:
        try:
            await _push_membership(col, jf_url, jf_key, db)
            logger.info("Auto-pushed membership for collection %d (%s) to Jellyfin", col.id, col.name)
        except Exception:
            logger.warning("Auto-push to Jellyfin failed for collection %d (%s)", col.id, col.name, exc_info=True)

    return {"ok": True, "movies": len(movies), "shows": len(shows), "total": total}


async def _refresh_trakt(col: models.Collection, client_id: str, db: Session,
                         jf_url: str | None = None, jf_key: str | None = None) -> dict:
    from routers.trakt import _fetch_all_trakt_items
    entries = await _fetch_all_trakt_items(col.trakt_list_id, client_id)
    if not entries:
        return {"ok": False, "error": "No items returned from Trakt"}

    movie_tmdb_ids = set()
    show_tmdb_ids = set()
    total = 0
    for entry in entries:
        t = entry.get("type")
        obj = entry.get(t) or {}
        tmdb = str((obj.get("ids") or {}).get("tmdb") or "")
        if tmdb and tmdb != "0":
            if t == "movie":
                movie_tmdb_ids.add(tmdb)
            elif t == "show":
                show_tmdb_ids.add(tmdb)
        total += 1

    movies = db.query(models.Movie).filter(models.Movie.tmdb_id.in_(movie_tmdb_ids)).all() if movie_tmdb_ids else []
    shows = db.query(models.Show).filter(models.Show.tmdb_id.in_(show_tmdb_ids)).all() if show_tmdb_ids else []

    current_movie_ids = {m.id for m in col.movies}
    current_show_ids = {s.id for s in col.shows}
    changed = {m.id for m in movies} != current_movie_ids or {s.id for s in shows} != current_show_ids
    col.movies = movies
    col.shows = shows
    col.trakt_total_items = total
    if changed:
        col.updated_at = datetime.utcnow()
    db.commit()

    if changed and col.in_jellyfin and col.jellyfin_collection_id and jf_url and jf_key:
        try:
            await _push_membership(col, jf_url, jf_key, db)
            logger.info("Auto-pushed membership for collection %d (%s) to Jellyfin", col.id, col.name)
        except Exception:
            logger.warning("Auto-push to Jellyfin failed for collection %d (%s)", col.id, col.name, exc_info=True)

    return {"ok": True, "movies": len(movies), "shows": len(shows), "total": total}


async def refresh_all_managed(
    db: Session,
    tmdb_key: str | None,
    mdb_key: str | None,
    jf_url: str | None = None,
    jf_key: str | None = None,
    trakt_client_id: str | None = None,
) -> dict:
    """Refresh every TMDB and MDBList collection. Returns summary counts."""
    cols = (
        db.query(models.Collection)
        .filter(
            (models.Collection.tmdb_collection_id.isnot(None)) |
            (models.Collection.mdblist_list_id.isnot(None)) |
            (models.Collection.trakt_list_id.isnot(None))
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
                result = await _refresh_tmdb(col, tmdb_key, db, jf_url, jf_key)
            elif col.mdblist_list_id:
                if not mdb_key:
                    skipped += 1
                    continue
                result = await _refresh_mdblist(col, mdb_key, db, jf_url, jf_key)
            else:
                if not trakt_client_id:
                    skipped += 1
                    continue
                result = await _refresh_trakt(col, trakt_client_id, db, jf_url, jf_key)

            if result.get("ok"):
                refreshed += 1
            else:
                logger.warning("Refresh failed for collection %d (%s): %s", col.id, col.name, result.get("error"))
                failed += 1
        except Exception:
            logger.exception("Unhandled error refreshing collection %d (%s)", col.id, col.name)
            failed += 1

    return {"refreshed": refreshed, "failed": failed, "skipped": skipped}
