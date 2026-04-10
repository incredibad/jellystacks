from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import httpx

from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter()

SETTING_KEYS = ["jellyfin_url", "jellyfin_api_key", "jellyfin_user_id", "tmdb_api_key"]


def _get_settings_dict(db: Session) -> dict:
    rows = db.query(models.AppSetting).filter(models.AppSetting.key.in_(SETTING_KEYS)).all()
    return {r.key: r.value for r in rows}


def _set_setting(db: Session, key: str, value: str):
    row = db.query(models.AppSetting).filter(models.AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(models.AppSetting(key=key, value=value))


@router.get("", response_model=schemas.SettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    s = _get_settings_dict(db)
    return schemas.SettingsResponse(
        jellyfin_url=s.get("jellyfin_url"),
        jellyfin_api_key_set=bool(s.get("jellyfin_api_key")),
        jellyfin_user_id=s.get("jellyfin_user_id"),
        tmdb_api_key_set=bool(s.get("tmdb_api_key")),
    )


@router.put("", response_model=schemas.SettingsResponse)
def update_settings(
    data: schemas.SettingsUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    updates = data.model_dump(exclude_none=True)
    for key, value in updates.items():
        if key in SETTING_KEYS:
            _set_setting(db, key, value)
    db.commit()
    return get_settings(db, _)


@router.post("/test-jellyfin", response_model=schemas.JellyfinTestResult)
async def test_jellyfin(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    s = _get_settings_dict(db)
    url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")

    if not url or not api_key:
        return schemas.JellyfinTestResult(
            success=False, server_name=None, version=None,
            message="Jellyfin URL and API key are required.",
        )

    headers = {
        "Authorization": (
            f'MediaBrowser Client="JellyStacks", Device="JellyStacks Server", '
            f'DeviceId="jellystacks-server-1", Version="1.0.0", Token="{api_key}"'
        )
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{url.rstrip('/')}/System/Info", headers=headers)
        if resp.status_code == 200:
            info = resp.json()
            return schemas.JellyfinTestResult(
                success=True,
                server_name=info.get("ServerName"),
                version=info.get("Version"),
                message="Connected successfully.",
            )
        return schemas.JellyfinTestResult(
            success=False, server_name=None, version=None,
            message=f"Jellyfin returned HTTP {resp.status_code}.",
        )
    except Exception as e:
        return schemas.JellyfinTestResult(
            success=False, server_name=None, version=None,
            message=f"Connection failed: {str(e)}",
        )


@router.get("/jellyfin-users")
async def get_jellyfin_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    s = _get_settings_dict(db)
    url = s.get("jellyfin_url")
    api_key = s.get("jellyfin_api_key")

    if not url or not api_key:
        raise HTTPException(400, "Jellyfin not configured.")

    headers = {
        "Authorization": (
            f'MediaBrowser Client="JellyStacks", Device="JellyStacks Server", '
            f'DeviceId="jellystacks-server-1", Version="1.0.0", Token="{api_key}"'
        )
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{url.rstrip('/')}/Users", headers=headers)
        resp.raise_for_status()
        users = resp.json()
        return [{"id": u["Id"], "name": u["Name"]} for u in users]
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch Jellyfin users: {str(e)}")
