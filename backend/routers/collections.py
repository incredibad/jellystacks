import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
import httpx
from PIL import Image

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
        jellyfin_synced_at=c.jellyfin_synced_at,
        created_at=c.created_at,
        updated_at=c.updated_at,
        movie_count=len(c.movies),
        movies=[_movie_to_response(m) for m in c.movies],
    )


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
def get_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")
    return _collection_to_detail(col)


@router.put("/{collection_id}", response_model=schemas.CollectionDetailResponse)
def update_collection(
    collection_id: int,
    data: schemas.CollectionUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")

    updates = data.model_dump(exclude_none=True)
    for key, value in updates.items():
        setattr(col, key, value)
    col.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(col)
    return _collection_to_detail(col)


@router.delete("/{collection_id}")
def delete_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")
    db.delete(col)
    db.commit()
    return {"ok": True}


@router.post("/{collection_id}/movies", response_model=schemas.CollectionDetailResponse)
def add_movies(
    collection_id: int,
    data: schemas.CollectionMoviesAdd,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")

    existing_ids = {m.id for m in col.movies}
    new_movies = db.query(models.Movie).filter(
        models.Movie.id.in_(data.movie_ids)
    ).all()

    for movie in new_movies:
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
    col = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")

    col.movies = [m for m in col.movies if m.id != movie_id]
    col.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(col)
    return _collection_to_detail(col)


async def _upload_artwork_to_jellyfin(
    client: httpx.AsyncClient,
    jf_url: str,
    api_key: str,
    jf_collection_id: str,
    artwork_url: str,
):
    """Download artwork from TMDB/URL, convert to PNG, upload to Jellyfin."""
    try:
        img_resp = await client.get(artwork_url, timeout=30)
        if img_resp.status_code != 200:
            return

        img = Image.open(io.BytesIO(img_resp.content)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        headers = _jellyfin_headers(api_key)
        headers["Content-Type"] = "image/png"

        await client.post(
            f"{jf_url.rstrip('/')}/Items/{jf_collection_id}/Images/Primary",
            headers=headers,
            content=png_bytes,
            timeout=30,
        )
    except Exception:
        pass  # Artwork upload failure should not fail the push


@router.post("/{collection_id}/push", response_model=schemas.PushResult)
async def push_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")

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

    async with httpx.AsyncClient(timeout=30) as client:
        if col.jellyfin_collection_id:
            # Verify the collection still exists in Jellyfin
            check = await client.get(
                f"{base}/Items/{col.jellyfin_collection_id}",
                headers=headers,
            )
            if check.status_code == 200:
                # Collection exists — sync items
                items_resp = await client.get(
                    f"{base}/Items",
                    headers=headers,
                    params={
                        "ParentId": col.jellyfin_collection_id,
                        "IncludeItemTypes": "Movie",
                        "Recursive": "true",
                        "Fields": "Id",
                        "Limit": 1000,
                    },
                )
                current_ids = set()
                if items_resp.status_code == 200:
                    current_ids = {
                        item["Id"] for item in items_resp.json().get("Items", [])
                    }

                wanted_ids = set(movie_jf_ids)
                to_add = wanted_ids - current_ids
                to_remove = current_ids - wanted_ids

                if to_remove:
                    await client.delete(
                        f"{base}/Collections/{col.jellyfin_collection_id}/Items",
                        headers=headers,
                        params={"ids": ",".join(to_remove)},
                    )
                if to_add:
                    await client.post(
                        f"{base}/Collections/{col.jellyfin_collection_id}/Items",
                        headers=headers,
                        params={"ids": ",".join(to_add)},
                    )

                if col.artwork_url:
                    await _upload_artwork_to_jellyfin(
                        client, base, api_key, col.jellyfin_collection_id, col.artwork_url
                    )

                col.in_jellyfin = True
                col.jellyfin_synced_at = datetime.utcnow()
                db.commit()
                return schemas.PushResult(
                    success=True,
                    jellyfin_collection_id=col.jellyfin_collection_id,
                    message="Collection updated in Jellyfin.",
                )
            else:
                # Stale ID — fall through to create new
                col.jellyfin_collection_id = None

        # Create new collection in Jellyfin
        resp = await client.post(
            f"{base}/Collections",
            headers=headers,
            params={
                "name": col.name,
                "ids": ",".join(movie_jf_ids),
                "isLocked": "false",
            },
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(502, f"Jellyfin error {resp.status_code}: {resp.text}")

        jf_col_id = resp.json().get("Id")
        if not jf_col_id:
            raise HTTPException(502, "Jellyfin returned no collection ID.")

        if col.artwork_url:
            await _upload_artwork_to_jellyfin(client, base, api_key, jf_col_id, col.artwork_url)

        col.jellyfin_collection_id = jf_col_id
        col.in_jellyfin = True
        col.jellyfin_synced_at = datetime.utcnow()
        db.commit()

        return schemas.PushResult(
            success=True,
            jellyfin_collection_id=jf_col_id,
            message="Collection created in Jellyfin.",
        )


@router.post("/push-all")
async def push_all_collections(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cols = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).all()

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


@router.post("/{collection_id}/verify", response_model=schemas.CollectionResponse)
async def verify_jellyfin_status(
    collection_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    col = db.query(models.Collection).options(
        selectinload(models.Collection.movies)
    ).filter(models.Collection.id == collection_id).first()
    if not col:
        raise HTTPException(404, "Collection not found.")

    if not col.jellyfin_collection_id:
        col.in_jellyfin = False
        db.commit()
        return _collection_to_response(col)

    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")

    if not jf_url or not api_key:
        raise HTTPException(400, "Jellyfin not configured.")

    headers = _jellyfin_headers(api_key)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{jf_url.rstrip('/')}/Items/{col.jellyfin_collection_id}",
                headers=headers,
            )
        col.in_jellyfin = resp.status_code == 200
        db.commit()
    except Exception:
        col.in_jellyfin = False
        db.commit()

    return _collection_to_response(col)


@router.post("/verify-all")
async def verify_all(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
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

    headers = _jellyfin_headers(api_key)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.delete(
                f"{jf_url.rstrip('/')}/Items/{col.jellyfin_collection_id}",
                headers=headers,
            )
    except Exception:
        pass

    col.jellyfin_collection_id = None
    col.in_jellyfin = False
    col.jellyfin_synced_at = None
    db.commit()
    return {"ok": True}
