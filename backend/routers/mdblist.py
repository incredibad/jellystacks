import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from routers.settings import _get_settings_dict

router = APIRouter()

_MDBLIST_BASE = "https://api.mdblist.com"


def _get_api_key(db: Session) -> str:
    s = _get_settings_dict(db)
    key = s.get("mdblist_api_key")
    if not key:
        raise HTTPException(400, "MDBList API key not configured.")
    return key


def _split_raw_response(raw) -> tuple[set, set, int]:
    """Return (tmdb_movie_ids, tmdb_show_ids, total_count) from a MDBList items response.

    MDBList returns { movies: [...], shows: [...], seasons: [...], episodes: [...] }.
    Each item has its TMDB ID at item['ids']['tmdb'] (with item['id'] as fallback).
    """
    if isinstance(raw, dict):
        movies_raw = raw.get("movies") or []
        shows_raw = raw.get("shows") or []
    elif isinstance(raw, list):
        movies_raw = [i for i in raw if (i.get("mediatype") or "").lower() == "movie"]
        shows_raw = [i for i in raw if (i.get("mediatype") or "").lower() in ("show", "tv")]
    else:
        return set(), set(), 0

    def _extract(items):
        ids = set()
        for item in items:
            tmdb = (item.get("ids") or {}).get("tmdb") or item.get("tmdb_id") or item.get("id")
            if tmdb and str(tmdb) != "0":
                ids.add(str(tmdb))
        return ids

    return _extract(movies_raw), _extract(shows_raw), len(movies_raw) + len(shows_raw)


@router.get("/search")
async def search_lists(
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    api_key = _get_api_key(db)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{_MDBLIST_BASE}/lists/search",
            params={"query": query, "apikey": api_key},
        )
    if resp.status_code != 200:
        raise HTTPException(502, "MDBList search failed.")
    raw = resp.json()
    return raw if isinstance(raw, list) else raw.get("search", raw.get("results", []))


@router.get("/lists/{list_id}/preview")
async def preview_list(
    list_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    api_key = _get_api_key(db)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_MDBLIST_BASE}/lists/{list_id}/items",
            params={"apikey": api_key},
        )
    if resp.status_code != 200:
        raise HTTPException(502, "Failed to fetch list items.")

    movie_ids, show_ids, total = _split_raw_response(resp.json())

    movie_count = (
        db.query(models.Movie).filter(models.Movie.tmdb_id.in_(movie_ids)).count()
        if movie_ids else 0
    )
    show_count = (
        db.query(models.Show).filter(models.Show.tmdb_id.in_(show_ids)).count()
        if show_ids else 0
    )

    return {"movie_count": movie_count, "show_count": show_count, "total_items": total}
