import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
import httpx

from database import get_db
import models
import schemas
from auth import get_current_user
from routers.settings import _get_settings_dict

router = APIRouter()


def _jellyfin_headers(api_key: str) -> dict:
    return {
        "Authorization": (
            f'MediaBrowser Client="JellyStacks", Device="JellyStacks Server", '
            f'DeviceId="jellystacks-server-1", Version="1.0.0", Token="{api_key}"'
        )
    }


def _movie_to_response(m: models.Movie) -> schemas.MovieResponse:
    return schemas.MovieResponse(
        id=m.id,
        jellyfin_id=m.jellyfin_id,
        title=m.title,
        sort_title=m.sort_title,
        year=m.year,
        overview=m.overview,
        tmdb_id=m.tmdb_id,
        imdb_id=m.imdb_id,
        genres=m.genres,
        runtime=m.runtime,
        community_rating=m.community_rating,
        has_poster=bool(m.primary_image_tag),
        last_synced=m.last_synced,
    )


@router.get("", response_model=list[schemas.MovieResponse])
def list_movies(
    search: str = Query(default="", alias="q"),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    query = db.query(models.Movie)
    if search:
        query = query.filter(models.Movie.title.ilike(f"%{search}%"))
    movies = query.order_by(models.Movie.sort_title, models.Movie.title).all()
    return [_movie_to_response(m) for m in movies]


@router.get("/count")
def movie_count(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return {"count": db.query(models.Movie).count()}


@router.get("/{movie_id}/poster")
async def movie_poster(
    movie_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(404, "Movie not found.")

    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")

    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin not configured.")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{jf_url.rstrip('/')}/Items/{movie.jellyfin_id}/Images/Primary",
                params={"maxWidth": 400, "api_key": api_key},
            )
        if resp.status_code != 200:
            raise HTTPException(404, "Poster not available.")
        return Response(
            content=resp.content,
            media_type=resp.headers.get("content-type", "image/jpeg"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch poster: {str(e)}")


@router.post("/sync", response_model=schemas.SyncResult)
async def sync_movies(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")
    user_id = s.get("jellyfin_user_id")

    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin URL and API key are required. Configure them in Settings.")

    headers = _jellyfin_headers(api_key)
    base_url = jf_url.rstrip("/")

    all_items = []
    start = 0
    limit = 500

    # Determine which endpoint to use
    items_url = f"{base_url}/Items" if not user_id else f"{base_url}/Users/{user_id}/Items"

    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            params = {
                "IncludeItemTypes": "Movie",
                "Recursive": "true",
                "Fields": "ProviderIds,Overview,Genres,SortName,RunTimeTicks,CommunityRating",
                "ImageTypeLimit": "1",
                "EnableImageTypes": "Primary",
                "Limit": limit,
                "StartIndex": start,
            }
            resp = await client.get(items_url, headers=headers, params=params)
            if resp.status_code != 200:
                raise HTTPException(502, f"Jellyfin returned HTTP {resp.status_code}: {resp.text}")

            data = resp.json()
            items = data.get("Items", [])
            all_items.extend(items)
            total = data.get("TotalRecordCount", 0)

            if start + limit >= total:
                break
            start += limit

    # Upsert movies into local DB
    synced = 0
    for item in all_items:
        jf_id = item.get("Id")
        if not jf_id:
            continue

        runtime_ticks = item.get("RunTimeTicks")
        runtime_min = int(runtime_ticks / 600_000_000) if runtime_ticks else None

        genres = item.get("Genres", [])
        provider_ids = item.get("ProviderIds", {})

        image_tags = item.get("ImageTags", {})
        primary_tag = image_tags.get("Primary")

        rating = item.get("CommunityRating")
        rating_str = f"{rating:.1f}" if rating else None

        existing = db.query(models.Movie).filter(models.Movie.jellyfin_id == jf_id).first()
        if existing:
            existing.title = item.get("Name", "Unknown")
            existing.sort_title = item.get("SortName")
            existing.year = item.get("ProductionYear")
            existing.overview = item.get("Overview")
            existing.tmdb_id = provider_ids.get("Tmdb")
            existing.imdb_id = provider_ids.get("Imdb")
            existing.genres = json.dumps(genres)
            existing.runtime = runtime_min
            existing.community_rating = rating_str
            existing.primary_image_tag = primary_tag
            existing.last_synced = datetime.utcnow()
        else:
            db.add(models.Movie(
                jellyfin_id=jf_id,
                title=item.get("Name", "Unknown"),
                sort_title=item.get("SortName"),
                year=item.get("ProductionYear"),
                overview=item.get("Overview"),
                tmdb_id=provider_ids.get("Tmdb"),
                imdb_id=provider_ids.get("Imdb"),
                genres=json.dumps(genres),
                runtime=runtime_min,
                community_rating=rating_str,
                primary_image_tag=primary_tag,
                last_synced=datetime.utcnow(),
            ))
        synced += 1

    db.commit()
    return schemas.SyncResult(synced=synced, total=len(all_items))
