import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from routers.settings import _get_settings_dict

router = APIRouter()

_TRAKT_BASE = "https://api.trakt.tv"


def _trakt_headers(client_id: str) -> dict:
    return {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": client_id,
    }


def _get_client_id(db: Session) -> str:
    s = _get_settings_dict(db)
    cid = s.get("trakt_client_id")
    if not cid:
        raise HTTPException(400, "Trakt Client ID not configured.")
    return cid


async def _fetch_all_trakt_items(trakt_id: int, client_id: str) -> list:
    """Fetch every item in a Trakt list, following pagination headers."""
    all_items = []
    page = 1
    page_size = 1000
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(
                f"{_TRAKT_BASE}/lists/{trakt_id}/items",
                headers=_trakt_headers(client_id),
                params={"limit": page_size, "page": page},
            )
            if resp.status_code != 200:
                break
            all_items.extend(resp.json())
            page_count = int(resp.headers.get("X-Pagination-Page-Count", 1))
            if page >= page_count:
                break
            page += 1
    return all_items


def _normalise_list(lst: dict) -> dict:
    """Flatten a Trakt list object into a consistent shape for the frontend."""
    return {
        "id": lst["ids"]["trakt"],
        "name": lst.get("name", ""),
        "description": lst.get("description") or "",
        "item_count": lst.get("item_count", 0),
        "likes": lst.get("likes", 0),
        "username": (lst.get("user") or {}).get("username", ""),
    }


@router.get("/trending")
async def trending_lists(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client_id = _get_client_id(db)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{_TRAKT_BASE}/lists/trending",
            headers=_trakt_headers(client_id),
            params={"limit": 20},
        )
    if resp.status_code != 200:
        raise HTTPException(502, "Failed to fetch trending Trakt lists.")
    return [_normalise_list(item["list"]) for item in resp.json()]


@router.get("/search")
async def search_lists(
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client_id = _get_client_id(db)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{_TRAKT_BASE}/search/list",
            headers=_trakt_headers(client_id),
            params={"query": query, "limit": 30},
        )
    if resp.status_code != 200:
        raise HTTPException(502, "Trakt search failed.")
    return [_normalise_list(item["list"]) for item in resp.json() if item.get("type") == "list"]


@router.get("/lists/{trakt_id}/preview")
async def preview_list(
    trakt_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client_id = _get_client_id(db)
    items_raw = await _fetch_all_trakt_items(trakt_id, client_id)
    if not items_raw:
        raise HTTPException(502, "Failed to fetch Trakt list items.")

    items_raw = resp.json()
    movie_tmdb_ids = set()
    show_tmdb_ids = set()
    movies_raw = []
    shows_raw = []

    for entry in items_raw:
        t = entry.get("type")
        if t == "movie":
            obj = entry["movie"]
            tmdb = str((obj.get("ids") or {}).get("tmdb") or "")
            if tmdb and tmdb != "0":
                movie_tmdb_ids.add(tmdb)
            movies_raw.append(obj)
        elif t == "show":
            obj = entry["show"]
            tmdb = str((obj.get("ids") or {}).get("tmdb") or "")
            if tmdb and tmdb != "0":
                show_tmdb_ids.add(tmdb)
            shows_raw.append(obj)

    owned_movie_ids = set(
        r[0] for r in db.query(models.Movie.tmdb_id).filter(models.Movie.tmdb_id.in_(movie_tmdb_ids)).all()
    ) if movie_tmdb_ids else set()
    owned_show_ids = set(
        r[0] for r in db.query(models.Show.tmdb_id).filter(models.Show.tmdb_id.in_(show_tmdb_ids)).all()
    ) if show_tmdb_ids else set()

    def make_item(obj, mediatype, owned_set):
        tmdb = str((obj.get("ids") or {}).get("tmdb") or "0")
        return {
            "title": obj.get("title", ""),
            "year": obj.get("year"),
            "mediatype": mediatype,
            "owned": tmdb in owned_set,
        }

    items = (
        [make_item(o, "movie", owned_movie_ids) for o in movies_raw] +
        [make_item(o, "show", owned_show_ids) for o in shows_raw]
    )

    return {
        "movie_count": len(owned_movie_ids),
        "show_count": len(owned_show_ids),
        "total_items": len(items_raw),
        "items": items,
    }
