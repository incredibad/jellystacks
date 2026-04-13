import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, selectinload
import httpx

from database import get_db
import models
import schemas
from auth import get_current_user
from routers.settings import _get_settings_dict
from routers.movies import _jellyfin_headers, _movie_to_response

router = APIRouter()


def _collection_to_response(c: models.Collection) -> schemas.CollectionResponse:
    return schemas.CollectionResponse(
        id=c.id,
        name=c.name,
        description=c.description,
        artwork_url=c.artwork_url,
        jellyfin_collection_id=c.jellyfin_collection_id,
        in_jellyfin=c.in_jellyfin,
        is_jellyfin_native=c.is_jellyfin_native,
        jellyfin_synced_at=c.jellyfin_synced_at,
        created_at=c.created_at,
        updated_at=c.updated_at,
        movie_count=len(c.movies),
    )


def _collection_to_detail(c: models.Collection) -> schemas.CollectionDetailResponse:
    return schemas.CollectionDetailResponse(
        id=c.id,
        name=c.name,
        description=c.description,
        artwork_url=c.artwork_url,
        jellyfin_collection_id=c.jellyfin_collection_id,
        in_jellyfin=c.in_jellyfin,
        is_jellyfin_native=c.is_jellyfin_native,
        jellyfin_synced_at=c.jellyfin_synced_at,
        created_at=c.created_at,
        updated_at=c.updated_at,
        movie_count=len(c.movies),
        movies=[_movie_to_response(m) for m in c.movies],
    )


def _load_col(collection_id: int, db: Session) -> models.Collection:
    col = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")
    return col


@router.get("", response_model=list[schemas.CollectionResponse])
def list_collections(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    cols = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).order_by(models.Collection.name).all()
    return [_collection_to_response(c) for c in cols]


@router.post("", response_model=schemas.CollectionDetailResponse)
def create_collection(
    data: schemas.CollectionCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = models.Collection(name=data.name, description=data.description)
    db.add(col)
    db.commit()
    db.refresh(col)
    return _collection_to_detail(col)


@router.get("/{collection_id}", response_model=schemas.CollectionDetailResponse)
def get_collection(collection_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return _collection_to_detail(_load_col(collection_id, db))


@router.put("/{collection_id}", response_model=schemas.CollectionDetailResponse)
def update_collection(
    collection_id: int,
    data: schemas.CollectionUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = _load_col(collection_id, db)
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(col, key, value)
    col.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(col)
    return _collection_to_detail(col)


@router.delete("/jellyfin-native")
def clear_jellyfin_native(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Delete all Jellyfin-imported collections from the local database (does not touch Jellyfin)."""
    deleted = db.query(models.Collection).filter(
        models.Collection.is_jellyfin_native == True  # noqa: E712
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@router.delete("/{collection_id}")
def delete_collection(collection_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    col = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")
    db.delete(col)
    db.commit()
    return {"ok": True}


@router.get("/{collection_id}/poster")
async def get_collection_poster(collection_id: int, db: Session = Depends(get_db)):
    """Proxy the Jellyfin collection poster image so the browser doesn't need an API key."""
    col = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not col or not col.jellyfin_collection_id:
        raise HTTPException(404, "No Jellyfin collection.")
    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")
    if not jf_url or not api_key:
        raise HTTPException(404, "Jellyfin not configured.")
    url = f"{jf_url.rstrip('/')}/Items/{col.jellyfin_collection_id}/Images/Primary"
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(url, headers=_jellyfin_headers(api_key))
    if resp.status_code != 200:
        raise HTTPException(404, "No image.")
    content_type = resp.headers.get("content-type", "image/jpeg")
    return Response(content=resp.content, media_type=content_type)


@router.post("/{collection_id}/movies", response_model=schemas.CollectionDetailResponse)
def add_movies(
    collection_id: int,
    data: schemas.CollectionMoviesAdd,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = _load_col(collection_id, db)
    existing_ids = {m.id for m in col.movies}
    for movie in db.query(models.Movie).filter(models.Movie.id.in_(data.movie_ids)).all():
        if movie.id not in existing_ids:
            col.movies.append(movie)
    col.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(col)
    return _collection_to_detail(col)


@router.delete("/{collection_id}/movies/{movie_id}", response_model=schemas.CollectionDetailResponse)
def remove_movie(
    collection_id: int,
    movie_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = _load_col(collection_id, db)
    col.movies = [m for m in col.movies if m.id != movie_id]
    col.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(col)
    return _collection_to_detail(col)


async def _upload_artwork(jf_url: str, api_key: str, jf_col_id: str, artwork_url: str) -> str | None:
    """Tell Jellyfin to fetch the artwork directly from TMDB via RemoteImages/Download.

    This avoids raw-byte uploads (which return HTTP 500 on some Jellyfin
    configurations) by letting Jellyfin's own image pipeline fetch and store
    the image — the same mechanism it uses for metadata providers.

    Returns None on success or an error string on failure.
    """
    try:
        image_url = artwork_url.replace('/original/', '/w500/')
        headers = _jellyfin_headers(api_key)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{jf_url.rstrip('/')}/Items/{jf_col_id}/RemoteImages/Download",
                headers=headers,
                params={"Type": "Primary", "ImageUrl": image_url},
            )
        if resp.status_code not in (200, 204):
            return f"Jellyfin RemoteImages/Download returned HTTP {resp.status_code}: {resp.text[:200]}"
        return None
    except Exception as exc:
        return str(exc)


@router.post("/{collection_id}/push", response_model=schemas.PushResult)
async def push_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = _load_col(collection_id, db)

    if not col.movies:
        raise HTTPException(400, "Cannot push an empty collection to Jellyfin.")

    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")
    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin is not configured. Go to Settings first.")

    headers = _jellyfin_headers(api_key)
    base = jf_url.rstrip("/")
    movie_jf_ids = [m.jellyfin_id for m in col.movies]
    user_id = s.get("jellyfin_user_id")

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        if col.jellyfin_collection_id:
            old_jf_id = col.jellyfin_collection_id
            check_params = {"UserId": user_id} if user_id else {}
            check = await client.get(
                f"{base}/Items/{old_jf_id}",
                headers=headers,
                params=check_params,
            )

            if check.status_code == 200 and check.json().get("Name") == col.name:
                # Collection exists in Jellyfin with the same name — sync in place.
                items_resp = await client.get(
                    f"{base}/Items",
                    headers=headers,
                    params={"ParentId": old_jf_id, "IncludeItemTypes": "Movie",
                            "Recursive": "true", "Fields": "Id", "Limit": 1000},
                )
                current_ids = set()
                if items_resp.status_code == 200:
                    current_ids = {item["Id"] for item in items_resp.json().get("Items", [])}

                wanted = set(movie_jf_ids)
                to_remove = current_ids - wanted
                to_add = wanted - current_ids

                if to_remove:
                    await client.delete(
                        f"{base}/Collections/{old_jf_id}/Items",
                        headers=headers,
                        params={"ids": ",".join(to_remove)},
                    )
                if to_add:
                    await client.post(
                        f"{base}/Collections/{old_jf_id}/Items",
                        headers=headers,
                        params={"ids": ",".join(to_add)},
                    )

                artwork_err = None
                if col.artwork_url:
                    artwork_err = await _upload_artwork(base, api_key, old_jf_id, col.artwork_url)

                col.in_jellyfin = True
                col.jellyfin_synced_at = datetime.utcnow()
                db.commit()
                msg = "Collection updated in Jellyfin."
                if artwork_err:
                    msg += f" (artwork upload failed: {artwork_err})"
                return schemas.PushResult(success=True, jellyfin_collection_id=old_jf_id, message=msg)

            # Name changed or collection not found in Jellyfin.
            # Always delete the old Jellyfin collection before recreating so we
            # don't leave orphaned duplicates (ignore errors — it may already be gone).
            await client.delete(f"{base}/Items/{old_jf_id}", headers=headers)
            col.jellyfin_collection_id = None

        resp = await client.post(
            f"{base}/Collections",
            headers=headers,
            params={"name": col.name, "ids": ",".join(movie_jf_ids), "isLocked": "false"},
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(502, f"Jellyfin error {resp.status_code}: {resp.text}")

        jf_col_id = resp.json().get("Id")
        if not jf_col_id:
            raise HTTPException(502, "Jellyfin returned no collection ID.")

        artwork_err = None
        if col.artwork_url:
            # Give Jellyfin a moment to finish indexing the newly created
            # collection before we attempt the image upload — BoxSet creation
            # is partially asynchronous and an immediate upload can return 500.
            await asyncio.sleep(1)
            artwork_err = await _upload_artwork(base, api_key, jf_col_id, col.artwork_url)

        col.jellyfin_collection_id = jf_col_id
        col.in_jellyfin = True
        col.jellyfin_synced_at = datetime.utcnow()
        db.commit()
        msg = "Collection created in Jellyfin."
        if artwork_err:
            msg += f" (artwork upload failed: {artwork_err})"
        return schemas.PushResult(success=True, jellyfin_collection_id=jf_col_id, message=msg)


@router.post("/push-all")
async def push_all_collections(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cols = db.query(models.Collection).options(selectinload(models.Collection.movies)).all()
    results = []
    for col in cols:
        if not col.movies:
            results.append({"id": col.id, "name": col.name, "skipped": True, "reason": "empty"})
            continue
        try:
            result = await push_collection(col.id, db, current_user)
            results.append({"id": col.id, "name": col.name, "success": result.success})
        except HTTPException as e:
            results.append({"id": col.id, "name": col.name, "success": False, "reason": e.detail})
    return {"results": results}


@router.post("/import-from-jellyfin", response_model=schemas.ImportResult)
async def import_from_jellyfin(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Import BoxSets that exist in Jellyfin but haven't been created in JellyStacks yet."""
    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")
    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin not configured.")

    headers = _jellyfin_headers(api_key)
    base = jf_url.rstrip("/")
    imported = 0
    updated = 0

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{base}/Items",
            headers=headers,
            params={"IncludeItemTypes": "BoxSet", "Recursive": "true",
                    "Fields": "Overview,PrimaryImageTag", "Limit": 500},
        )
        if resp.status_code != 200:
            raise HTTPException(502, f"Jellyfin error: {resp.status_code}")

        for bs in resp.json().get("Items", []):
            jf_id = bs.get("Id")
            name = bs.get("Name", "Unknown")

            existing = db.query(models.Collection).filter(
                models.Collection.jellyfin_collection_id == jf_id
            ).first()

            if existing:
                if existing.name != name:
                    existing.name = name
                    updated += 1
                # Repair timestamp drift on existing native collections: if updated_at
                # is only microseconds ahead of jellyfin_synced_at it's SQLAlchemy
                # insert-time drift, not a real local change — pin them equal so the
                # collection doesn't falsely show "Needs Sync".
                if (
                    existing.is_jellyfin_native
                    and existing.jellyfin_synced_at
                    and existing.updated_at
                    and 0 < (existing.updated_at - existing.jellyfin_synced_at).total_seconds() < 1
                ):
                    existing.jellyfin_synced_at = existing.updated_at
                continue

            # Fetch movies in this BoxSet
            items_resp = await client.get(
                f"{base}/Items",
                headers=headers,
                params={"ParentId": jf_id, "IncludeItemTypes": "Movie",
                        "Recursive": "true", "Fields": "Id", "Limit": 1000},
            )
            movie_jf_ids = []
            if items_resp.status_code == 200:
                movie_jf_ids = [item["Id"] for item in items_resp.json().get("Items", [])]

            movies = []
            if movie_jf_ids:
                movies = db.query(models.Movie).filter(
                    models.Movie.jellyfin_id.in_(movie_jf_ids)
                ).all()

            col = models.Collection(
                name=name,
                description=bs.get("Overview"),
                jellyfin_collection_id=jf_id,
                in_jellyfin=True,
                is_jellyfin_native=True,
            )
            col.movies = movies
            db.add(col)
            db.flush()  # Triggers INSERT so SQLAlchemy populates updated_at via its default
            col.jellyfin_synced_at = col.updated_at  # Pin to exact same value — no drift possible
            imported += 1

    db.commit()
    return schemas.ImportResult(imported=imported, updated=updated)


@router.post("/{collection_id}/verify", response_model=schemas.CollectionResponse)
async def verify_jellyfin_status(
    collection_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = _load_col(collection_id, db)
    if not col.jellyfin_collection_id:
        col.in_jellyfin = False
        db.commit()
        return _collection_to_response(col)

    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")
    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin not configured.")

    # Use a dedicated client with redirects enabled. Include UserId if configured —
    # some Jellyfin setups require it for item lookups.
    params = {}
    user_id = s.get("jellyfin_user_id")
    if user_id:
        params["UserId"] = user_id

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.get(
            f"{jf_url.rstrip('/')}/Items/{col.jellyfin_collection_id}",
            headers=_jellyfin_headers(api_key),
            params=params,
        )

    # Only update the DB if we got a definitive answer (200 = exists, 404 = gone).
    # Any other status (401, 502, etc.) means the check was inconclusive — leave
    # in_jellyfin unchanged so a transient error doesn't wipe the known state.
    if resp.status_code == 200:
        col.in_jellyfin = True
        db.commit()
    elif resp.status_code == 404:
        col.in_jellyfin = False
        col.jellyfin_collection_id = None
        db.commit()
    # else: inconclusive — don't touch the DB

    return _collection_to_response(col)


@router.post("/verify-all")
async def verify_all(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    cols = db.query(models.Collection).filter(
        models.Collection.jellyfin_collection_id.isnot(None)
    ).options(selectinload(models.Collection.movies)).all()
    for col in cols:
        await verify_jellyfin_status(col.id, db, current_user)
    return {"verified": len(cols)}


@router.delete("/{collection_id}/jellyfin")
async def remove_from_jellyfin(
    collection_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")
    if not col.jellyfin_collection_id:
        raise HTTPException(400, "This collection is not in Jellyfin.")

    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")
    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin not configured.")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.delete(
                f"{jf_url.rstrip('/')}/Items/{col.jellyfin_collection_id}",
                headers=_jellyfin_headers(api_key),
            )
    except Exception:
        pass

    col.jellyfin_collection_id = None
    col.in_jellyfin = False
    col.jellyfin_synced_at = None
    db.commit()
    return {"ok": True}
