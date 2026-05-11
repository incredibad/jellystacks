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
from auth import get_current_user
from routers.settings import _get_settings_dict
from routers.movies import _jellyfin_headers, _push_artwork_to_jf

router = APIRouter()

_ARTWORK_DIR = Path("/data/artwork/shows")
_ARTWORK_DIR.mkdir(parents=True, exist_ok=True)

_NO_STORE = {"Cache-Control": "no-store"}


def _show_to_response(s: models.Show) -> schemas.ShowResponse:
    return schemas.ShowResponse(
        id=s.id,
        jellyfin_id=s.jellyfin_id,
        title=s.title,
        sort_title=s.sort_title,
        year=s.year,
        overview=s.overview,
        tmdb_id=s.tmdb_id,
        imdb_id=s.imdb_id,
        tvdb_id=s.tvdb_id,
        genres=s.genres,
        seasons=s.seasons,
        status=s.status,
        community_rating=s.community_rating,
        has_poster=bool(s.primary_image_tag) or bool(s.custom_artwork_url),
        custom_artwork_url=s.custom_artwork_url,
        library_name=s.library_name,
        library_id=s.library_id,
        last_synced=s.last_synced,
    )


def _dedup_subquery(db: Session):
    return (
        db.query(func.min(models.Show.id).label("id"))
        .group_by(models.Show.title, models.Show.year, models.Show.library_name)
        .subquery()
    )


@router.get("", response_model=list[schemas.ShowResponse])
def list_shows(
    search: str = Query(default="", alias="q"),
    library: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    dedup = _dedup_subquery(db)
    query = db.query(models.Show).filter(models.Show.id.in_(db.query(dedup.c.id)))
    if search:
        query = query.filter(models.Show.title.ilike(f"%{search}%"))
    if library:
        query = query.filter(models.Show.library_name == library)
    shows = query.order_by(models.Show.sort_title, models.Show.title).offset(offset).limit(limit).all()
    return [_show_to_response(s) for s in shows]


@router.get("/count")
def show_count(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    dedup = _dedup_subquery(db)
    count = db.query(func.count()).select_from(
        db.query(models.Show).filter(models.Show.id.in_(db.query(dedup.c.id))).subquery()
    ).scalar()
    return {"count": count}


@router.get("/libraries")
def list_libraries(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.Show.library_name)
        .filter(models.Show.library_name.isnot(None))
        .distinct()
        .order_by(models.Show.library_name)
        .all()
    )
    return [r[0] for r in rows]


@router.get("/{show_id}/poster")
async def show_poster(show_id: int, db: Session = Depends(get_db)):
    show = db.query(models.Show).filter(models.Show.id == show_id).first()
    if not show:
        raise HTTPException(404, "Show not found.")

    # Check for custom artwork first
    if show.custom_artwork_url:
        if show.custom_artwork_url.startswith('/data/'):
            p = Path(show.custom_artwork_url)
            if p.exists():
                return FileResponse(str(p), media_type='image/jpeg', headers=_NO_STORE)
        else:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    r = await client.get(show.custom_artwork_url)
                if r.status_code == 200:
                    return Response(content=r.content, media_type=r.headers.get('content-type', 'image/jpeg'), headers=_NO_STORE)
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
                f"{jf_url.rstrip('/')}/Items/{show.jellyfin_id}/Images/Primary",
                params={"maxWidth": 400, "api_key": api_key},
            )
        if resp.status_code != 200:
            raise HTTPException(404, "Poster not available.")
        return Response(content=resp.content, media_type=resp.headers.get("content-type", "image/jpeg"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch poster: {e}")


@router.post("/{show_id}/artwork/upload", response_model=schemas.ShowResponse)
async def upload_show_artwork(
    show_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    show = db.query(models.Show).filter(models.Show.id == show_id).first()
    if not show:
        raise HTTPException(404, "Show not found.")
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
    path = _ARTWORK_DIR / f"{show_id}.jpg"
    path.write_bytes(jpeg_bytes)
    show.custom_artwork_url = str(path)
    db.commit()
    db.refresh(show)
    s = _get_settings_dict(db)
    if s.get("jellyfin_url") and s.get("jellyfin_api_key"):
        await _push_artwork_to_jf(s["jellyfin_url"], s["jellyfin_api_key"], show.jellyfin_id, str(path))
    return _show_to_response(show)


class ArtworkUrlRequest(BaseModel):
    url: str


@router.put("/{show_id}/artwork", response_model=schemas.ShowResponse)
async def set_show_artwork_url(
    show_id: int,
    data: ArtworkUrlRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    show = db.query(models.Show).filter(models.Show.id == show_id).first()
    if not show:
        raise HTTPException(404, "Show not found.")
    show.custom_artwork_url = data.url
    db.commit()
    db.refresh(show)
    s = _get_settings_dict(db)
    if s.get("jellyfin_url") and s.get("jellyfin_api_key"):
        await _push_artwork_to_jf(s["jellyfin_url"], s["jellyfin_api_key"], show.jellyfin_id, data.url)
    return _show_to_response(show)


@router.delete("/{show_id}/artwork", response_model=schemas.ShowResponse)
async def clear_show_artwork(
    show_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    show = db.query(models.Show).filter(models.Show.id == show_id).first()
    if not show:
        raise HTTPException(404, "Show not found.")
    show.custom_artwork_url = None
    path = _ARTWORK_DIR / f"{show_id}.jpg"
    if path.exists():
        path.unlink()
    s = _get_settings_dict(db)
    if s.get("jellyfin_url") and s.get("jellyfin_api_key"):
        base = s["jellyfin_url"].rstrip("/")
        headers = _jellyfin_headers(s["jellyfin_api_key"])
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                await client.delete(
                    f"{base}/Items/{show.jellyfin_id}/Images/Primary",
                    headers=headers,
                )
                await client.post(
                    f"{base}/Items/{show.jellyfin_id}/Refresh",
                    headers=headers,
                    params={"MetadataRefreshMode": "None", "ImageRefreshMode": "FullRefresh", "ReplaceAllImages": "false"},
                )
        except Exception as e:
            print(f"[artwork] JF revert failed: {e}", flush=True)
    db.commit()
    db.refresh(show)
    return _show_to_response(show)


@router.post("/sync", response_model=schemas.SyncResult)
async def sync_shows(
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
        # ── Step 1: fetch TV show libraries ───────────────────────────────────
        libraries = []
        try:
            vf_resp = await client.get(f"{base}/Library/VirtualFolders", headers=headers)
            if vf_resp.status_code == 200:
                for vf in vf_resp.json():
                    ctype = vf.get("CollectionType", "")
                    if ctype in ("tvshows", "mixed"):
                        libraries.append({
                            "id": vf.get("ItemId"),
                            "name": vf.get("Name", "TV Shows"),
                        })
        except Exception:
            pass

        if not libraries:
            libraries = [{"id": None, "name": None}]

        # ── Step 2: fetch shows per library ───────────────────────────────────
        all_items: list[tuple[dict, str | None, str | None]] = []
        seen: set[str] = set()

        for lib in libraries:
            start = 0
            while True:
                params: dict = {
                    "IncludeItemTypes": "Series",
                    "Recursive": "true",
                    "Fields": "ProviderIds,Overview,Genres,SortName,CommunityRating,Tags,People,ChildCount,Status",
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
        seasons = item.get("ChildCount")
        status = item.get("Status")

        existing = db.query(models.Show).filter(models.Show.jellyfin_id == jf_id).first()
        if existing:
            existing.title = item.get("Name", "Unknown")
            existing.sort_title = item.get("SortName")
            existing.year = item.get("ProductionYear")
            existing.overview = item.get("Overview")
            existing.tmdb_id = provider_ids.get("Tmdb")
            existing.imdb_id = provider_ids.get("Imdb")
            existing.tvdb_id = provider_ids.get("Tvdb")
            existing.genres = json.dumps(genres)
            existing.tags = json.dumps(tags)
            existing.people = json.dumps(people)
            existing.seasons = seasons
            existing.status = status
            existing.community_rating = rating_str
            existing.primary_image_tag = primary_tag
            existing.library_name = lib_name
            existing.library_id = lib_id
            existing.last_synced = datetime.utcnow()
        else:
            db.add(models.Show(
                jellyfin_id=jf_id,
                title=item.get("Name", "Unknown"),
                sort_title=item.get("SortName"),
                year=item.get("ProductionYear"),
                overview=item.get("Overview"),
                tmdb_id=provider_ids.get("Tmdb"),
                imdb_id=provider_ids.get("Imdb"),
                tvdb_id=provider_ids.get("Tvdb"),
                genres=json.dumps(genres),
                tags=json.dumps(tags),
                people=json.dumps(people),
                seasons=seasons,
                status=status,
                community_rating=rating_str,
                primary_image_tag=primary_tag,
                library_name=lib_name,
                library_id=lib_id,
                last_synced=datetime.utcnow(),
            ))
        synced += 1

    db.commit()
    return schemas.SyncResult(synced=synced, total=len(all_items))
