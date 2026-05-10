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


def _parse_items(raw) -> list:
    if isinstance(raw, list):
        return raw
    return raw.get("items", [])


def _split_tmdb_ids(items: list) -> tuple[set, set]:
    """Return (tmdb_movie_ids, tmdb_show_ids) as string sets."""
    movie_ids, show_ids = set(), set()
    for item in items:
        raw_id = item.get("tmdb_id") or item.get("tmdb")
        tmdb_id = str(raw_id) if raw_id and str(raw_id) != "0" else None
        if not tmdb_id:
            continue
        mediatype = (item.get("mediatype") or "").lower()
        if mediatype == "movie":
            movie_ids.add(tmdb_id)
        elif mediatype in ("show", "tv"):
            show_ids.add(tmdb_id)
    return movie_ids, show_ids


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

    items = _parse_items(resp.json())
    movie_ids, show_ids = _split_tmdb_ids(items)

    movie_count = (
        db.query(models.Movie).filter(models.Movie.tmdb_id.in_(movie_ids)).count()
        if movie_ids else 0
    )
    show_count = (
        db.query(models.Show).filter(models.Show.tmdb_id.in_(show_ids)).count()
        if show_ids else 0
    )

    return {"movie_count": movie_count, "show_count": show_count, "total_items": len(items)}
