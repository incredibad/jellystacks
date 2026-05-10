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


def _split_raw_response(raw) -> tuple[set, set, int, list, list]:
    """Return (tmdb_movie_ids, tmdb_show_ids, total_count, movies_raw, shows_raw)."""
    if isinstance(raw, dict):
        movies_raw = raw.get("movies") or []
        shows_raw = raw.get("shows") or []
    elif isinstance(raw, list):
        movies_raw = [i for i in raw if (i.get("mediatype") or "").lower() == "movie"]
        shows_raw = [i for i in raw if (i.get("mediatype") or "").lower() in ("show", "tv")]
    else:
        return set(), set(), 0, [], []

    def _extract(items):
        ids = set()
        for item in items:
            tmdb = (item.get("ids") or {}).get("tmdb") or item.get("tmdb_id") or item.get("id")
            if tmdb and str(tmdb) != "0":
                ids.add(str(tmdb))
        return ids

    return (
        _extract(movies_raw),
        _extract(shows_raw),
        len(movies_raw) + len(shows_raw),
        movies_raw,
        shows_raw,
    )


@router.get("/top")
async def top_lists(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    api_key = _get_api_key(db)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{_MDBLIST_BASE}/lists/top",
            params={"apikey": api_key},
        )
    if resp.status_code != 200:
        raise HTTPException(502, "Failed to fetch top lists.")
    raw = resp.json()
    return raw if isinstance(raw, list) else raw.get("lists", raw.get("top", []))


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

    movie_ids, show_ids, total, movies_raw, shows_raw = _split_raw_response(resp.json())

    owned_movie_ids = set(
        r[0] for r in db.query(models.Movie.tmdb_id).filter(models.Movie.tmdb_id.in_(movie_ids)).all()
    ) if movie_ids else set()
    owned_show_ids = set(
        r[0] for r in db.query(models.Show.tmdb_id).filter(models.Show.tmdb_id.in_(show_ids)).all()
    ) if show_ids else set()

    def make_item(item, mediatype, owned_set):
        tmdb = str((item.get("ids") or {}).get("tmdb") or item.get("tmdb_id") or item.get("id") or 0)
        return {
            "title": item.get("title") or "",
            "year": item.get("release_year"),
            "mediatype": mediatype,
            "owned": tmdb in owned_set,
        }

    items = (
        [make_item(i, "movie", owned_movie_ids) for i in movies_raw] +
        [make_item(i, "show", owned_show_ids) for i in shows_raw]
    )

    return {
        "movie_count": len(owned_movie_ids),
        "show_count": len(owned_show_ids),
        "total_items": total,
        "items": items,
    }
