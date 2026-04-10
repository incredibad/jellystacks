from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
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
    posters = data.get("posters", [])
    backdrops = data.get("backdrops", [])

    def make_entry(img: dict, size: str = "w342") -> dict:
        path = img["file_path"]
        return {
            "file_path": path,
            "width": img.get("width"),
            "height": img.get("height"),
            "vote_average": img.get("vote_average"),
            "thumb_url": f"/api/tmdb/proxy-image?url={TMDB_IMG_BASE}/{size}{path}",
            "full_url": f"{TMDB_IMG_BASE}/original{path}",
        }

    return {
        "posters": [make_entry(p) for p in posters[:30]],
        "backdrops": [make_entry(b, "w780") for b in backdrops[:15]],
    }


@router.get("/proxy-image")
async def proxy_image(
    url: str = Query(...),
    _: models.User = Depends(get_current_user),
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
