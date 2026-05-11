import io
import re
import shutil
import uuid
import zipfile
from difflib import SequenceMatcher
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from PIL import Image as PILImage

from database import get_db
import models
from auth import get_current_user
from routers.settings import _get_settings_dict
from routers.movies import _push_artwork_to_jf

router = APIRouter()

_TMP_DIR = Path("/data/artwork/tmp")
_TMP_DIR.mkdir(parents=True, exist_ok=True)

_MOVIE_ART_DIR = Path("/data/artwork/movies")
_SHOW_ART_DIR = Path("/data/artwork/shows")
_MOVIE_ART_DIR.mkdir(parents=True, exist_ok=True)
_SHOW_ART_DIR.mkdir(parents=True, exist_ok=True)

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"}


def _normalize(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\(\d{4}\)", "", s)
    s = re.sub(r"\.\d{4}\.", ".", s)
    s = re.sub(r"[._\-\[\]()]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def _best_match(stem: str, movies: list, shows: list) -> dict:
    best_score = 0.0
    best_id = None
    best_type = None
    best_title = None

    for m in movies:
        score = _similarity(stem, m.title)
        if score > best_score:
            best_score = score
            best_id = m.id
            best_type = "movie"
            best_title = m.title

    for s in shows:
        score = _similarity(stem, s.title)
        if score > best_score:
            best_score = score
            best_id = s.id
            best_type = "show"
            best_title = s.title

    return {
        "match_id": best_id,
        "match_type": best_type,
        "match_title": best_title,
        "confidence": round(best_score, 3),
    }


def _to_jpeg(data: bytes) -> bytes:
    img = PILImage.open(io.BytesIO(data))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=92)
    return buf.getvalue()


@router.post("/match")
async def bulk_match(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    movies = db.query(models.Movie).all()
    shows = db.query(models.Show).all()

    batch_id = uuid.uuid4().hex
    batch_dir = _TMP_DIR / batch_id
    batch_dir.mkdir(parents=True)

    image_files: list[tuple[str, bytes]] = []

    for upload in files:
        data = await upload.read()
        ext = Path(upload.filename or "").suffix.lower()
        if ext == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as zf:
                    for name in zf.namelist():
                        if Path(name).suffix.lower() in _IMAGE_EXTS and not name.startswith("__"):
                            image_files.append((Path(name).name, zf.read(name)))
            except zipfile.BadZipFile:
                raise HTTPException(400, f"{upload.filename} is not a valid zip file.")
        elif ext in _IMAGE_EXTS:
            image_files.append((upload.filename or "image.jpg", data))

    if not image_files:
        shutil.rmtree(batch_dir, ignore_errors=True)
        raise HTTPException(400, "No image files found in the upload.")

    results = []
    for filename, data in image_files:
        try:
            jpeg = _to_jpeg(data)
        except Exception:
            continue
        safe_name = re.sub(r"[^\w\-.]", "_", filename)
        tmp_path = batch_dir / safe_name
        tmp_path.write_bytes(jpeg)

        stem = Path(filename).stem
        match = _best_match(stem, movies, shows)

        versions = []
        if match["match_id"] and match["match_type"] == "movie":
            ref = next((m for m in movies if m.id == match["match_id"]), None)
            if ref:
                versions = [
                    {"id": m.id, "library_name": m.library_name or "Unknown"}
                    for m in movies
                    if m.title == ref.title and m.year == ref.year
                ]
        elif match["match_id"] and match["match_type"] == "show":
            ref = next((s for s in shows if s.id == match["match_id"]), None)
            if ref:
                versions = [
                    {"id": s.id, "library_name": s.library_name or "Unknown"}
                    for s in shows
                    if s.title == ref.title and s.year == ref.year
                ]

        results.append({
            "filename": filename,
            "tmp_name": safe_name,
            "batch_id": batch_id,
            "versions": versions,
            **match,
        })

    if not results:
        shutil.rmtree(batch_dir, ignore_errors=True)
        raise HTTPException(400, "No valid images could be processed.")

    return {"batch_id": batch_id, "matches": results}


@router.get("/preview/{batch_id}/{tmp_name}")
async def preview_image(
    batch_id: str,
    tmp_name: str,
):
    if ".." in batch_id or ".." in tmp_name:
        raise HTTPException(400)
    path = _TMP_DIR / batch_id / tmp_name
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(str(path), media_type="image/jpeg")


class ApplyItem(BaseModel):
    batch_id: str
    tmp_name: str
    match_type: str
    match_id: int


class BulkApplyRequest(BaseModel):
    items: list[ApplyItem]


@router.post("/apply")
async def bulk_apply(
    body: BulkApplyRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    s = _get_settings_dict(db)
    jf_url = s.get("jellyfin_url")
    jf_key = s.get("jellyfin_api_key")

    applied = 0
    errors = []

    for item in body.items:
        if ".." in item.batch_id or ".." in item.tmp_name:
            errors.append(f"Invalid path: {item.tmp_name}")
            continue

        src = _TMP_DIR / item.batch_id / item.tmp_name
        if not src.exists():
            errors.append(f"Temp file not found: {item.tmp_name}")
            continue

        try:
            if item.match_type == "movie":
                record = db.query(models.Movie).filter(models.Movie.id == item.match_id).first()
                if not record:
                    errors.append(f"Record not found: movie {item.match_id}")
                    continue
                all_versions = db.query(models.Movie).filter(
                    models.Movie.title == record.title,
                    models.Movie.year == record.year,
                ).all()
                art_dir = _MOVIE_ART_DIR
            elif item.match_type == "show":
                record = db.query(models.Show).filter(models.Show.id == item.match_id).first()
                if not record:
                    errors.append(f"Record not found: show {item.match_id}")
                    continue
                all_versions = db.query(models.Show).filter(
                    models.Show.title == record.title,
                    models.Show.year == record.year,
                ).all()
                art_dir = _SHOW_ART_DIR
            else:
                errors.append(f"Unknown type: {item.match_type}")
                continue

            for version in all_versions:
                dest = art_dir / f"{version.id}.jpg"
                shutil.copy2(src, dest)
                version.custom_artwork_url = str(dest)
                if jf_url and jf_key:
                    try:
                        await _push_artwork_to_jf(jf_url, jf_key, version.jellyfin_id, str(dest))
                    except Exception:
                        pass

            db.commit()
            applied += 1
        except Exception as e:
            errors.append(f"Failed for {item.tmp_name}: {e}")

    # Clean up all referenced batch dirs
    batch_ids = {item.batch_id for item in body.items}
    for bid in batch_ids:
        if not re.match(r"^[a-f0-9]{32}$", bid):
            continue
        shutil.rmtree(_TMP_DIR / bid, ignore_errors=True)

    return {"applied": applied, "errors": errors}
