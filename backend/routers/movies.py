import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
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
        library_name=m.library_name,
        library_id=m.library_id,
        last_synced=m.last_synced,
    )


def _dedup_subquery(db: Session):
    """Return a subquery of the lowest movie id per (title, year, library_name) group.

    This ensures that when a movie has multiple files in Jellyfin they are
    represented by a single row within each library.
    """
    return (
        db.query(func.min(models.Movie.id).label("id"))
        .group_by(models.Movie.title, models.Movie.year, models.Movie.library_name)
        .subquery()
    )


@router.get("", response_model=list[schemas.MovieResponse])
def list_movies(
    search: str = Query(default="", alias="q"),
    library: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    dedup = _dedup_subquery(db)
    query = db.query(models.Movie).filter(models.Movie.id.in_(db.query(dedup.c.id)))
    if search:
        query = query.filter(models.Movie.title.ilike(f"%{search}%"))
    if library:
        query = query.filter(models.Movie.library_name == library)
    movies = query.order_by(models.Movie.sort_title, models.Movie.title).offset(offset).limit(limit).all()
    return [_movie_to_response(m) for m in movies]


@router.get("/count")
def movie_count(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    dedup = _dedup_subquery(db)
    count = db.query(func.count()).select_from(
        db.query(models.Movie).filter(models.Movie.id.in_(db.query(dedup.c.id))).subquery()
    ).scalar()
    return {"count": count}


@router.get("/libraries")
def list_libraries(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    """Return distinct library names present in the local movie cache."""
    rows = (
        db.query(models.Movie.library_name)
        .filter(models.Movie.library_name.isnot(None))
        .distinct()
        .order_by(models.Movie.library_name)
        .all()
    )
    return [r[0] for r in rows]


# ── Poster proxy — no auth required (movie artwork is not sensitive) ──────────
@router.get("/{movie_id}/poster")
async def movie_poster(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(404, "Movie not found.")

    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")

    if not jf_url or not api_key:
        raise HTTPException(503, "Jellyfin not configured.")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{jf_url.rstrip('/')}/Items/{movie.jellyfin_id}/Images/Primary",
                params={"maxWidth": 400, "api_key": api_key},
            )
        if resp.status_code != 200:
            raise HTTPException(404, "Poster not available.")
        return Response(content=resp.content, media_type=resp.headers.get("content-type", "image/jpeg"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch poster: {e}")


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
    base = jf_url.rstrip("/")
    items_url = f"{base}/Users/{user_id}/Items" if user_id else f"{base}/Items"

    async with httpx.AsyncClient(timeout=60) as client:
        # ── Step 1: fetch movie libraries ─────────────────────────────────────
        libraries = []
        try:
            vf_resp = await client.get(f"{base}/Library/VirtualFolders", headers=headers)
            if vf_resp.status_code == 200:
                for vf in vf_resp.json():
                    ctype = vf.get("CollectionType", "")
                    if ctype in ("movies", "mixed"):
                        libraries.append({
                            "id": vf.get("ItemId"),
                            "name": vf.get("Name", "Movies"),
                        })
        except Exception:
            pass

        # Fall back to a single sweep with no library filter
        if not libraries:
            libraries = [{"id": None, "name": None}]

        # ── Step 2: fetch movies per library ──────────────────────────────────
        all_items: list[tuple[dict, str | None, str | None]] = []
        seen: set[str] = set()

        for lib in libraries:
            start = 0
            while True:
                params: dict = {
                    "IncludeItemTypes": "Movie",
                    "Recursive": "true",
                    "Fields": "ProviderIds,Overview,Genres,SortName,RunTimeTicks,CommunityRating",
                    "ImageTypeLimit": "1",
                    "EnableImageTypes": "Primary",
                    "Limit": 500,
                    "StartIndex": start,
                }
                if lib["id"]:
                    params["ParentId"] = lib["id"]

                resp = await client.get(items_url, headers=headers, params=params)
                if resp.status_code != 200:
                    raise HTTPException(502, f"Jellyfin returned HTTP {resp.status_code}: {resp.text}")

                data = resp.json()
                items = data.get("Items", [])
                total = data.get("TotalRecordCount", 0)

                for item in items:
                    jf_id = item.get("Id")
                    if jf_id and jf_id not in seen:
                        seen.add(jf_id)
                        all_items.append((item, lib["name"], lib["id"]))

                if start + 500 >= total:
                    break
                start += 500

    # ── Step 3: upsert ────────────────────────────────────────────────────────
    synced = 0
    for item, lib_name, lib_id in all_items:
        jf_id = item.get("Id")
        if not jf_id:
            continue

        runtime_ticks = item.get("RunTimeTicks")
        runtime_min = int(runtime_ticks / 600_000_000) if runtime_ticks else None
        genres = item.get("Genres", [])
        provider_ids = item.get("ProviderIds", {})
        primary_tag = (item.get("ImageTags") or {}).get("Primary")
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
            existing.library_name = lib_name
            existing.library_id = lib_id
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
                library_name=lib_name,
                library_id=lib_id,
                last_synced=datetime.utcnow(),
            ))
        synced += 1

    db.commit()
    return schemas.SyncResult(synced=synced, total=len(all_items))
