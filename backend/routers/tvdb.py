import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import httpx

from database import get_db
import models
from auth import get_current_user
from routers.settings import _get_settings_dict

router = APIRouter()

TVDB_BASE = "https://api4.thetvdb.com/v4"
TVDB_IMG_BASE = "https://artworks.thetvdb.com/banners"

# In-process token cache: {api_key: (token, expires_at)}
_token_cache: dict[str, tuple[str, float]] = {}


def _get_tvdb_key(db: Session) -> str:
    s = _get_settings_dict(db)
    key = s.get("tvdb_api_key")
    if not key:
        raise HTTPException(400, "TheTVDB API key is not configured. Add it in Settings → Providers.")
    return key


async def _get_token(api_key: str) -> str:
    cached = _token_cache.get(api_key)
    if cached and time.time() < cached[1]:
        return cached[0]

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{TVDB_BASE}/login", json={"apikey": api_key})
    if resp.status_code != 200:
        raise HTTPException(502, f"TheTVDB login failed: {resp.status_code}")

    token = resp.json()["data"]["token"]
    # Tokens are valid for 30 days; refresh after 29
    _token_cache[api_key] = (token, time.time() + 29 * 86400)
    return token


def _make_poster_entry(artwork: dict) -> dict:
    image = artwork.get("image", "")
    thumbnail = artwork.get("thumbnail") or image
    return {
        "file_path": image,
        "width": artwork.get("width"),
        "height": artwork.get("height"),
        "vote_average": artwork.get("score"),
        "thumb_url": f"{TVDB_IMG_BASE}/{thumbnail}",
        "full_url": f"{TVDB_IMG_BASE}/{image}",
        "language": artwork.get("language"),
    }


@router.get("/show/{tvdb_id}/posters")
async def get_show_posters(
    tvdb_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    api_key = _get_tvdb_key(db)
    token = await _get_token(api_key)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TVDB_BASE}/series/{tvdb_id}/artworks",
            params={"type": 2},  # type 2 = poster
            headers=headers,
        )

    if resp.status_code == 404:
        return []
    if resp.status_code != 200:
        raise HTTPException(502, f"TheTVDB error: {resp.status_code}")

    artworks = resp.json().get("data", []) or []
    posters = [_make_poster_entry(a) for a in artworks[:30]]
    return posters
