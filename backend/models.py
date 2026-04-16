from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    ForeignKey, Table,
)
from sqlalchemy.orm import relationship
from database import Base

collection_movies = Table(
    "collection_movies",
    Base.metadata,
    Column("collection_id", Integer, ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
    Column("movie_id", Integer, ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    jellyfin_id = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, index=True, nullable=False)
    sort_title = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    overview = Column(Text, nullable=True)
    tmdb_id = Column(String, nullable=True)
    imdb_id = Column(String, nullable=True)
    genres = Column(String, nullable=True)
    runtime = Column(Integer, nullable=True)
    community_rating = Column(String, nullable=True)
    primary_image_tag = Column(String, nullable=True)
    library_name = Column(String, nullable=True)
    library_id = Column(String, nullable=True)
    last_synced = Column(DateTime, default=datetime.utcnow)

    collections = relationship("Collection", secondary=collection_movies, back_populates="movies")


class Collection(Base):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    artwork_url = Column(String, nullable=True)
    jellyfin_collection_id = Column(String, nullable=True, index=True)
    tmdb_collection_id = Column(String, nullable=True)
    in_jellyfin = Column(Boolean, default=False)
    is_jellyfin_native = Column(Boolean, default=False)  # True = existed in Jellyfin before JellyStacks
    jellyfin_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    movies = relationship("Movie", secondary=collection_movies, back_populates="collections")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True)
