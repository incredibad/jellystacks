"""
Background scheduler for periodic managed-collection refresh and library sync.

Polls every 60 s; runs when the configured interval has elapsed.
Intervals are read from the database on each tick so changes in Settings
take effect within a minute without a restart.
"""
import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("scheduler")

INTERVALS: dict[str, timedelta] = {
    "6h":     timedelta(hours=6),
    "12h":    timedelta(hours=12),
    "24h":    timedelta(hours=24),
    "weekly": timedelta(weeks=1),
}

_task: asyncio.Task | None = None


async def _run_refresh(db_factory) -> None:
    from refresh import refresh_all_managed
    from routers.settings import _get_settings_dict

    db = db_factory()
    try:
        s = _get_settings_dict(db)
        result = await refresh_all_managed(db, s.get("tmdb_api_key"), s.get("mdblist_api_key"), s.get("jellyfin_url"), s.get("jellyfin_api_key"), s.get("trakt_client_id"))
        logger.info("Scheduled collection refresh complete: %s", result)
    except Exception:
        logger.exception("Scheduled collection refresh failed")
    finally:
        db.close()


async def _run_library_sync(db_factory) -> None:
    import models
    import sync_log as _sync_log
    from routers.movies import _do_sync_movies
    from routers.shows import _do_sync_shows

    db = db_factory()
    try:
        user = db.query(models.User).first()
        if not user:
            logger.warning("Scheduled library sync skipped: no users in database")
            return

        logger.info("Running scheduled library sync")
        movie_run = _sync_log.start(user.id, "movies")
        show_run = _sync_log.start(user.id, "shows")

        try:
            movie_result = await _do_sync_movies(db, user, movie_run)
            _sync_log.finish(user.id, movie_run, "movies", {
                "synced": movie_result.synced, "deleted": movie_result.deleted,
                "skipped_cleanup": movie_result.skipped_cleanup,
            })
        except Exception:
            logger.exception("Scheduled movie sync failed")
            _sync_log.finish(user.id, movie_run, "movies", {"error": "scheduled sync failed"})

        try:
            show_result = await _do_sync_shows(db, user, show_run)
            _sync_log.finish(user.id, show_run, "shows", {
                "synced": show_result.synced, "deleted": show_result.deleted,
                "skipped_cleanup": show_result.skipped_cleanup,
            })
        except Exception:
            logger.exception("Scheduled show sync failed")
            _sync_log.finish(user.id, show_run, "shows", {"error": "scheduled sync failed"})

    finally:
        db.close()


async def _loop(db_factory) -> None:
    from routers.settings import _get_settings_dict

    last_collection_refresh: datetime | None = None
    last_library_sync: datetime | None = None

    while True:
        await asyncio.sleep(60)

        db = db_factory()
        try:
            s = _get_settings_dict(db)
            collection_interval_key = s.get("collection_refresh_interval", "disabled")
            library_interval_key = s.get("library_sync_interval", "disabled")
        finally:
            db.close()

        now = datetime.utcnow()

        collection_interval = INTERVALS.get(collection_interval_key)
        if collection_interval is not None:
            if last_collection_refresh is None or (now - last_collection_refresh) >= collection_interval:
                logger.info("Running scheduled collection refresh (interval=%s)", collection_interval_key)
                await _run_refresh(db_factory)
                last_collection_refresh = now

        library_interval = INTERVALS.get(library_interval_key)
        if library_interval is not None:
            if last_library_sync is None or (now - last_library_sync) >= library_interval:
                logger.info("Running scheduled library sync (interval=%s)", library_interval_key)
                await _run_library_sync(db_factory)
                last_library_sync = now


def start(db_factory) -> None:
    global _task
    _task = asyncio.get_event_loop().create_task(_loop(db_factory))
    logger.info("Scheduler started")


def stop() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
    _task = None
