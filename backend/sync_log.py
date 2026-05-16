"""
Shared in-memory store for the most recent sync run.

Both the movies and shows sync functions write to the same SyncRun instance
(keyed by user ID). The run is finalised once every participant has called
finish(), at which point a summary block is appended and the result is stored
as the latest log for that user.
"""

from datetime import datetime, timezone
from typing import Optional


class SyncRun:
    def __init__(self):
        self.started_at = datetime.now(timezone.utc)
        self.participants_started: set[str] = set()
        self.participants_done: set[str] = set()
        self.lines: list[dict] = []
        self.results: dict[str, dict] = {}


# Per-user active run and latest completed log
_active: dict[int, SyncRun] = {}
_latest: dict[int, dict] = {}


def start(user_id: int, participant: str) -> SyncRun:
    """Begin or join a sync run. Returns the shared SyncRun for this user."""
    if user_id not in _active:
        _active[user_id] = SyncRun()
    run = _active[user_id]
    run.participants_started.add(participant)
    return run


def log(run: SyncRun, tag: str, message: str, level: str = "info") -> None:
    """Append a structured log entry and echo to stdout."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    run.lines.append({"ts": ts, "tag": tag, "level": level, "text": message})
    print(f"[sync:{tag}] {message}", flush=True)


def finish(user_id: int, run: SyncRun, participant: str, result: dict) -> None:
    """Mark one participant done; finalise the run when all participants are done."""
    run.results[participant] = result
    run.participants_done.add(participant)

    if run.participants_started <= run.participants_done:
        finished_at = datetime.now(timezone.utc)
        duration = (finished_at - run.started_at).total_seconds()

        m = run.results.get("movies", {})
        s = run.results.get("shows", {})

        log(run, "system", "─" * 38, "separator")
        log(run, "system", f"Finished in {duration:.1f}s", "summary")
        if m:
            note = " — cleanup skipped" if m.get("skipped_cleanup") else ""
            log(run, "system",
                f"Movies: {m.get('synced', 0)} synced, {m.get('deleted', 0)} deleted{note}",
                "summary")
        if s:
            note = " — cleanup skipped" if s.get("skipped_cleanup") else ""
            log(run, "system",
                f"Shows: {s.get('synced', 0)} synced, {s.get('deleted', 0)} deleted{note}",
                "summary")

        _latest[user_id] = {
            "started_at": run.started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(duration, 1),
            "lines": run.lines,
            "movies_synced": m.get("synced", 0),
            "movies_deleted": m.get("deleted", 0),
            "shows_synced": s.get("synced", 0),
            "shows_deleted": s.get("deleted", 0),
        }
        _active.pop(user_id, None)


def get_latest(user_id: int) -> Optional[dict]:
    return _latest.get(user_id)
