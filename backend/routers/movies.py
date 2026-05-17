import base64
import io
import json
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
import httpx
from PIL import Image as PILImage

from database import get_db
import models
import schemas
import sync_log as _sync_log
from auth import get_current_user
from routers.settings import _get_settings_dict

router = APIRouter()

_ARTWORK_DIR = Path("/data/artwork/movies")
_ARTWORK_DIR.mkdir(parents=True, exist_ok=True)

# In-memory sync progress: user_id -> {"fetched": int, "total": int}
# Updated after each paginated fetch so the frontend can poll for live progress.
_sync_progress: dict[int, dict] = {}


def _jellyfin_headers(api_key: str) -> dict:
    return {
        "Authorization": (
            f'MediaBrowser Client="JellyStacks", Device="JellyStacks Server", '
            f'DeviceId="jellystacks-server-1", Version="1.0.0", Token="{api_key}"'
        )
    }


def _movie_to_response(m: models.Movie) -> schemas.MovieResponse:
    artwork_version = None
    if m.custom_artwork_url and m.custom_artwork_url.startswith('/data/'):
        p = Path(m.custom_artwork_url)
        if p.exists():
            artwork_version = int(p.stat().st_mtime)
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
        has_poster=bool(m.primary_image_tag) or bool(m.custom_artwork_url),
        custom_artwork_url=m.custom_artwork_url,
        artwork_version=artwork_version,
        primary_image_tag=m.primary_image_tag,
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
    has_custom_artwork: bool = Query(default=False),
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
    if has_custom_artwork:
        query = query.filter(models.Movie.custom_artwork_url.isnot(None))
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


@router.get("/sync/progress")
def get_movie_sync_progress(user: models.User = Depends(get_current_user)):
    """Return live pagination progress for an in-progress movie sync, or 404 if none is running."""
    data = _sync_progress.get(user.id)
    if data is None:
        raise HTTPException(404, "No movie sync in progress")
    return data


async def _push_artwork_to_jf(
    jf_url: str, api_key: str, jellyfin_id: str, custom_artwork_url: str
) -> None:
    """Push custom artwork to Jellyfin. Logs errors but does not raise."""
    try:
        headers = _jellyfin_headers(api_key)
        image_endpoint = f"{jf_url.rstrip('/')}/Items/{jellyfin_id}/Images/Primary"
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            if custom_artwork_url.startswith('/data/'):
                p = Path(custom_artwork_url)
                if not p.exists():
                    print(f"[artwork] local file not found: {p}", flush=True)
                    return
                image_bytes = p.read_bytes()
            else:
                r = await client.get(custom_artwork_url)
                if r.status_code != 200:
                    print(f"[artwork] fetch remote {r.status_code}", flush=True)
                    return
                image_bytes = r.content
            # Ensure JPEG
            img = PILImage.open(io.BytesIO(image_bytes))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=92)
            image_bytes = buf.getvalue()
            resp = await client.post(
                image_endpoint, content=image_bytes,
                headers={**headers, "Content-Type": "image/jpeg"},
            )
            print(f"[artwork] JF push {resp.status_code}", flush=True)
            if resp.status_code == 500:
                resp = await client.post(
                    image_endpoint, content=base64.b64encode(image_bytes),
                    headers={**headers, "Content-Type": "image/jpeg"},
                )
                print(f"[artwork] JF push b64 {resp.status_code}", flush=True)
    except Exception as e:
        print(f"[artwork] push to JF failed: {e}", flush=True)


_IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}

@router.get("/{movie_id}/poster")
async def movie_poster(movie_id: int, t: str | None = Query(None), db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(404, "Movie not found.")

    # Check for custom artwork first
    if movie.custom_artwork_url:
        if movie.custom_artwork_url.startswith('/data/'):
            p = Path(movie.custom_artwork_url)
            if p.exists():
                return FileResponse(str(p), media_type='image/jpeg', headers=_IMMUTABLE)
        else:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.get(movie.custom_artwork_url)
                if r.status_code == 200:
                    return Response(content=r.content, media_type=r.headers.get('content-type', 'image/jpeg'), headers=_IMMUTABLE)
            except Exception:
                pass

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
        cache = _IMMUTABLE if t else {"Cache-Control": "public, max-age=3600"}
        return Response(content=resp.content, media_type=resp.headers.get("content-type", "image/jpeg"), headers=cache)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch poster: {e}")


@router.post("/{movie_id}/artwork/upload", response_model=schemas.MovieResponse)
async def upload_movie_artwork(
    movie_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(404, "Movie not found.")
    contents = await file.read()
    try:
        img = PILImage.open(io.BytesIO(contents))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=92)
        jpeg_bytes = buf.getvalue()
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}")
    path = _ARTWORK_DIR / f"{movie_id}.jpg"
    path.write_bytes(jpeg_bytes)
    movie.custom_artwork_url = str(path)
    db.commit()
    db.refresh(movie)
    s = _get_settings_dict(db)
    if s.get("jellyfin_url") and s.get("jellyfin_api_key"):
        await _push_artwork_to_jf(s["jellyfin_url"], s["jellyfin_api_key"], movie.jellyfin_id, str(path))
    return _movie_to_response(movie)


class ArtworkUrlRequest(BaseModel):
    url: str


@router.put("/{movie_id}/artwork", response_model=schemas.MovieResponse)
async def set_movie_artwork_url(
    movie_id: int,
    data: ArtworkUrlRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(404, "Movie not found.")
    movie.custom_artwork_url = data.url
    db.commit()
    db.refresh(movie)
    s = _get_settings_dict(db)
    if s.get("jellyfin_url") and s.get("jellyfin_api_key"):
        await _push_artwork_to_jf(s["jellyfin_url"], s["jellyfin_api_key"], movie.jellyfin_id, data.url)
    return _movie_to_response(movie)


@router.delete("/{movie_id}/artwork", response_model=schemas.MovieResponse)
async def clear_movie_artwork(
    movie_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(404, "Movie not found.")
    movie.custom_artwork_url = None
    path = _ARTWORK_DIR / f"{movie_id}.jpg"
    if path.exists():
        path.unlink()
    s = _get_settings_dict(db)
    if s.get("jellyfin_url") and s.get("jellyfin_api_key"):
        base = s["jellyfin_url"].rstrip("/")
        headers = _jellyfin_headers(s["jellyfin_api_key"])
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                await client.delete(
                    f"{base}/Items/{movie.jellyfin_id}/Images/Primary",
                    headers=headers,
                )
                # Trigger JF to re-scrape missing images from providers
                await client.post(
                    f"{base}/Items/{movie.jellyfin_id}/Refresh",
                    headers=headers,
                    params={"MetadataRefreshMode": "None", "ImageRefreshMode": "FullRefresh", "ReplaceAllImages": "false"},
                )
        except Exception as e:
            print(f"[artwork] JF revert failed: {e}", flush=True)
    db.commit()
    db.refresh(movie)
    return _movie_to_response(movie)


@router.post("/sync", response_model=schemas.SyncResult)
async def sync_movies(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    run = _sync_log.start(user.id, "movies")
    _sync_progress[user.id] = {"fetched": 0, "total": 0}
    try:
        result = await _do_sync_movies(db, user, run)
        _sync_log.finish(user.id, run, "movies", {
            "synced": result.synced, "deleted": result.deleted,
            "skipped_cleanup": result.skipped_cleanup,
        })
        return result
    except Exception as exc:
        _sync_log.log(run, "movies", f"Error: {exc}", "error")
        _sync_log.finish(user.id, run, "movies", {"error": str(exc)})
        raise
    finally:
        _sync_progress.pop(user.id, None)


async def _do_sync_movies(db: Session, user: models.User, run: _sync_log.SyncRun) -> schemas.SyncResult:
    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")
    user_id = s.get("jellyfin_user_id")

    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin URL and API key are required. Configure them in Settings.")

    headers = _jellyfin_headers(api_key)
    base = jf_url.rstrip("/")
    items_url = f"{base}/Users/{user_id}/Items" if user_id else f"{base}/Items"

    async with httpx.AsyncClient(timeout=300) as client:
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

        _sync_log.log(run, "movies", f"Libraries: {', '.join(l['name'] or '(default)' for l in libraries)}")

        # ── Step 2a: pre-flight — fetch totals so the progress bar is accurate ─
        expected_total = 0
        for lib in libraries:
            count_params: dict = {
                "IncludeItemTypes": "Movie", "Recursive": "true", "Limit": 1, "StartIndex": 0,
            }
            if lib["id"]:
                count_params["ParentId"] = lib["id"]
            try:
                cr = await client.get(items_url, headers=headers, params=count_params)
                if cr.status_code == 200:
                    expected_total += cr.json().get("TotalRecordCount", 0)
            except Exception:
                pass
        _sync_progress[user.id] = {"fetched": 0, "total": expected_total}
        _sync_log.log(run, "movies", f"Expected: {expected_total} items")

        # ── Step 2b: fetch movies per library ─────────────────────────────────
        all_items: list[tuple[dict, str | None, str | None]] = []
        seen: set[str] = set()

        for lib in libraries:
            start = 0
            while True:
                params: dict = {
                    "IncludeItemTypes": "Movie",
                    "Recursive": "true",
                    "Fields": "ProviderIds,Overview,Genres,SortName,RunTimeTicks,CommunityRating,Tags,People",
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

                _sync_progress[user.id] = {"fetched": len(seen), "total": expected_total}

                if start + 500 >= total:
                    break
                start += 500

    _sync_log.log(run, "movies", f"Fetched {len(all_items)} movies — processing...")

    # ── Step 3: upsert ────────────────────────────────────────────────────────
    synced = 0
    total_items = len(all_items)
    for i, (item, lib_name, lib_id) in enumerate(all_items):
        if i % 500 == 0:
            _sync_log.log(run, "movies", f"Processing movies {i + 1}–{min(i + 500, total_items)} of {total_items}")
        jf_id = item.get("Id")
        if not jf_id:
            continue

        runtime_ticks = item.get("RunTimeTicks")
        runtime_min = int(runtime_ticks / 600_000_000) if runtime_ticks else None
        genres = item.get("Genres", [])
        tags = item.get("Tags", [])
        people = [
            {"name": p["Name"], "type": p.get("Type", "")}
            for p in (item.get("People") or [])[:30]
            if p.get("Name")
        ]
        provider_ids = item.get("ProviderIds", {})
        primary_tag = (item.get("ImageTags") or {}).get("Primary")
        rating = item.get("CommunityRating")
        rating_str = f"{rating:.1f}" if rating else None

        existing = db.query(models.Movie).filter(models.Movie.jellyfin_id == jf_id).first()
        if existing:
            _sync_log.log(run, "movies", f"Updated: {item.get('Name', 'Unknown')!r} ({item.get('ProductionYear')}) — {lib_name}", "updated")
            existing.title = item.get("Name", "Unknown")
            existing.sort_title = item.get("SortName")
            existing.year = item.get("ProductionYear")
            existing.overview = item.get("Overview")
            existing.tmdb_id = provider_ids.get("Tmdb")
            existing.imdb_id = provider_ids.get("Imdb")
            existing.genres = json.dumps(genres)
            existing.tags = json.dumps(tags)
            existing.people = json.dumps(people)
            existing.runtime = runtime_min
            existing.community_rating = rating_str
            existing.primary_image_tag = primary_tag
            existing.library_name = lib_name
            existing.library_id = lib_id
            existing.last_synced = datetime.utcnow()
        else:
            # Before creating, check for a stale record with the same
            # title+year+library whose jellyfin_id Jellyfin no longer reports
            # (happens when Jellyfin re-indexes a file with a new ID).
            # Update it in-place so collection memberships and artwork are kept.
            title_val = item.get("Name", "Unknown")
            year_val = item.get("ProductionYear")
            stale = db.query(models.Movie).filter(
                models.Movie.title == title_val,
                models.Movie.year == year_val,
                models.Movie.library_name == lib_name,
                models.Movie.jellyfin_id.notin_(seen),
            ).first()
            if stale:
                _sync_log.log(run, "movies", f"Re-indexed: {title_val!r} ({year_val})", "warning")
                stale.jellyfin_id = jf_id
                stale.sort_title = item.get("SortName")
                stale.overview = item.get("Overview")
                stale.tmdb_id = provider_ids.get("Tmdb")
                stale.imdb_id = provider_ids.get("Imdb")
                stale.genres = json.dumps(genres)
                stale.tags = json.dumps(tags)
                stale.people = json.dumps(people)
                stale.runtime = runtime_min
                stale.community_rating = rating_str
                stale.primary_image_tag = primary_tag
                stale.library_id = lib_id
                stale.last_synced = datetime.utcnow()
            else:
                _sync_log.log(run, "movies", f"New: {title_val!r} ({year_val}) — {lib_name}", "new")
                db.add(models.Movie(
                    jellyfin_id=jf_id,
                    title=item.get("Name", "Unknown"),
                    sort_title=item.get("SortName"),
                    year=item.get("ProductionYear"),
                    overview=item.get("Overview"),
                    tmdb_id=provider_ids.get("Tmdb"),
                    imdb_id=provider_ids.get("Imdb"),
                    genres=json.dumps(genres),
                    tags=json.dumps(tags),
                    people=json.dumps(people),
                    runtime=runtime_min,
                    community_rating=rating_str,
                    primary_image_tag=primary_tag,
                    library_name=lib_name,
                    library_id=lib_id,
                    last_synced=datetime.utcnow(),
                ))
        synced += 1

    # ── Cleanup: remove records Jellyfin no longer reports ────────────────────
    # Safety check: if JF returned fewer unique items than it claimed, or fewer
    # than 80% of the current DB count, skip cleanup to protect against partial
    # responses caused by transient JF API issues.
    deleted = 0
    skipped_cleanup = False
    db_movie_count = db.query(func.count(models.Movie.id)).scalar()
    if expected_total > 0 and len(seen) < expected_total:
        _sync_log.log(run, "movies", f"SAFETY: cleanup skipped — fetched {len(seen)} but JF reported {expected_total}", "warning")
        skipped_cleanup = True
    elif db_movie_count > 0 and len(seen) < db_movie_count * 0.8:
        _sync_log.log(run, "movies", f"SAFETY: cleanup skipped — fetched {len(seen)} but DB has {db_movie_count} records", "warning")
        skipped_cleanup = True
    else:
        for movie in db.query(models.Movie).filter(models.Movie.jellyfin_id.notin_(seen)).all():
            _sync_log.log(run, "movies", f"Deleted: {movie.title!r} ({movie.year}) [{movie.library_name}]", "deleted")
            if movie.custom_artwork_url:
                sibling = db.query(models.Movie).filter(
                    models.Movie.title == movie.title,
                    models.Movie.year == movie.year,
                    models.Movie.library_name == movie.library_name,
                    models.Movie.jellyfin_id.in_(seen),
                ).first()
                if sibling and not sibling.custom_artwork_url:
                    old_path = Path(movie.custom_artwork_url)
                    new_path = _ARTWORK_DIR / f"{sibling.id}.jpg"
                    try:
                        if old_path.exists():
                            old_path.rename(new_path)
                        sibling.custom_artwork_url = str(new_path)
                        _sync_log.log(run, "movies", f"Artwork transferred to sibling id={sibling.id}")
                    except Exception as e:
                        _sync_log.log(run, "movies", f"Artwork transfer failed: {e}", "error")
                else:
                    _sync_log.log(run, "movies", "Artwork deleted (no eligible sibling)")
                    try:
                        Path(movie.custom_artwork_url).unlink(missing_ok=True)
                    except Exception:
                        pass
            db.delete(movie)
            deleted += 1

    db.commit()
    return schemas.SyncResult(synced=synced, total=len(all_items), deleted=deleted, skipped_cleanup=skipped_cleanup)
