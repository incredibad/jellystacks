import asyncio
from typing import List
from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from database import get_db
import models
from auth import get_current_user
from routers.settings import _get_settings_dict

router = APIRouter()

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMG_BASE = "https://image.tmdb.org/t/p"


def _get_tmdb_key(db: Session) -> str:
    s = _get_settings_dict(db)
    key = s.get("tmdb_api_key")
    if not key:
        raise HTTPException(400, "TMDB API key is not configured. Add it in Settings.")
    return key


@router.get("/search")
async def search_tmdb(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    api_key = _get_tmdb_key(db)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TMDB_BASE}/search/movie",
            params={"api_key": api_key, "query": q, "include_adult": "false"},
        )
    if resp.status_code != 200:
        raise HTTPException(502, f"TMDB error: {resp.status_code}")

    results = resp.json().get("results", [])
    return [
        {
            "id": r["id"],
            "title": r.get("title") or r.get("name"),
            "year": (r.get("release_date") or "")[:4] or None,
            "overview": r.get("overview"),
            "poster_path": r.get("poster_path"),
            "poster_thumb": f"/api/tmdb/proxy-image?url={TMDB_IMG_BASE}/w185{r['poster_path']}"
            if r.get("poster_path")
            else None,
        }
        for r in results[:20]
    ]


def _make_image_entry(img: dict, size: str = "w342") -> dict:
    path = img["file_path"]
    return {
        "file_path": path,
        "width": img.get("width"),
        "height": img.get("height"),
        "vote_average": img.get("vote_average"),
        "thumb_url": f"/api/tmdb/proxy-image?url={TMDB_IMG_BASE}/{size}{path}",
        "full_url": f"{TMDB_IMG_BASE}/original{path}",
    }


@router.get("/movie/{tmdb_id}/images")
async def get_movie_images(
    tmdb_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    api_key = _get_tmdb_key(db)
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TMDB_BASE}/movie/{tmdb_id}/images",
            params={
                "api_key": api_key,
                "language": "en",
                "include_image_language": "en,null",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(502, f"TMDB error: {resp.status_code}")

    data = resp.json()
    return {
        "posters": [_make_image_entry(p) for p in data.get("posters", [])[:30]],
        "backdrops": [_make_image_entry(b, "w780") for b in data.get("backdrops", [])[:15]],
    }


class RelatedCollectionsRequest(BaseModel):
    tmdb_ids: List[int]


@router.post("/related-collections")
async def get_related_collection_images(
    body: RelatedCollectionsRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """For a list of TMDB movie IDs, find all TMDB collections they belong to and
    return the poster/backdrop images for each unique collection."""
    api_key = _get_tmdb_key(db)

    if not body.tmdb_ids:
        return []

    # Fetch movie details concurrently to discover belongs_to_collection
    async with httpx.AsyncClient(timeout=15) as client:
        resps = await asyncio.gather(
            *[client.get(f"{TMDB_BASE}/movie/{tid}", params={"api_key": api_key})
              for tid in body.tmdb_ids],
            return_exceptions=True,
        )

    # Deduplicate TMDB collection IDs preserving first-seen order
    seen: set[int] = set()
    collections = []
    for resp in resps:
        if isinstance(resp, Exception) or resp.status_code != 200:
            continue
        btc = resp.json().get("belongs_to_collection")
        if btc and btc["id"] not in seen:
            seen.add(btc["id"])
            collections.append({"id": btc["id"], "name": btc["name"]})

    if not collections:
        return []

    # Fetch images for each collection concurrently
    async with httpx.AsyncClient(timeout=15) as client:
        img_resps = await asyncio.gather(
            *[client.get(f"{TMDB_BASE}/collection/{c['id']}/images", params={"api_key": api_key})
              for c in collections],
            return_exceptions=True,
        )

    result = []
    for col, resp in zip(collections, img_resps):
        if isinstance(resp, Exception) or resp.status_code != 200:
            continue
        data = resp.json()
        result.append({
            "id": col["id"],
            "name": col["name"],
            "posters": [_make_image_entry(p) for p in data.get("posters", [])[:30]],
            "backdrops": [_make_image_entry(b, "w780") for b in data.get("backdrops", [])[:15]],
        })

    return result


@router.get("/proxy-image")
async def proxy_image(
    url: str = Query(...),
):
    decoded = unquote(url)
    # Only allow TMDB image CDN URLs
    if not decoded.startswith("https://image.tmdb.org/"):
        raise HTTPException(400, "Only TMDB image URLs are allowed.")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(decoded)
        if resp.status_code != 200:
            raise HTTPException(404, "Image not found.")
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/jpeg"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch image: {str(e)}")
