from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str


class SetupStatus(BaseModel):
    needs_setup: bool


# ── Movie ─────────────────────────────────────────────────────────────────────

class MovieResponse(BaseModel):
    id: int
    jellyfin_id: str
    title: str
    sort_title: Optional[str]
    year: Optional[int]
    overview: Optional[str]
    tmdb_id: Optional[str]
    imdb_id: Optional[str]
    genres: Optional[str]
    runtime: Optional[int]
    community_rating: Optional[str]
    has_poster: bool
    library_name: Optional[str]
    library_id: Optional[str]
    last_synced: datetime

    model_config = {"from_attributes": True}


class SyncResult(BaseModel):
    synced: int
    total: int


# ── Collection ────────────────────────────────────────────────────────────────

class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    artwork_url: Optional[str] = None
    tmdb_collection_id: Optional[str] = None


class CollectionMoviesAdd(BaseModel):
    movie_ids: List[int]


class UnownedMovieResponse(BaseModel):
    tmdb_id: str
    title: str
    year: Optional[str]
    overview: Optional[str]
    poster_url: Optional[str]


class CollectionResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    artwork_url: Optional[str]
    jellyfin_collection_id: Optional[str]
    tmdb_collection_id: Optional[str]
    tmdb_checked: bool
    tmdb_total_parts: Optional[int]
    in_jellyfin: bool
    is_jellyfin_native: bool
    jellyfin_synced_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    movie_count: int


class CollectionDetailResponse(CollectionResponse):
    movies: List[MovieResponse]


class PushResult(BaseModel):
    success: bool
    jellyfin_collection_id: Optional[str]
    message: str


class ImportResult(BaseModel):
    imported: int
    updated: int


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    jellyfin_url: Optional[str] = None
    jellyfin_api_key: Optional[str] = None
    jellyfin_user_id: Optional[str] = None
    tmdb_api_key: Optional[str] = None


class SettingsResponse(BaseModel):
    jellyfin_url: Optional[str]
    jellyfin_api_key_set: bool
    jellyfin_user_id: Optional[str]
    tmdb_api_key_set: bool


class JellyfinTestResult(BaseModel):
    success: bool
    server_name: Optional[str]
    version: Optional[str]
    message: str


# ── System ────────────────────────────────────────────────────────────────────

class PasswordChange(BaseModel):
    current_password: str
    new_password: str
