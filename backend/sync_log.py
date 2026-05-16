"""
Shared in-memory store for the most recent sync run.

Both the movies and shows sync functions write to the same SyncRun instance
(keyed by user ID). The run is finalised once every participant has called
finish(), at which point a summary block is appended and the result is stored
as the latest log for that user, written to disk, and echoed to stdout.

Persistence:
  /data/sync_log.json  — structured JSON, keyed by user_id; loaded on startup
                         so the API survives container restarts.
  /data/sync.log       — human-readable text, overwritten on each sync;
                         mirrors what is printed to Docker stdout.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_DATA_DIR = Path("/data")
_JSON_FILE = _DATA_DIR / "sync_log.json"
_TEXT_FILE = _DATA_DIR / "sync.log"


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
    """Append a structured log entry and echo to Docker stdout."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    run.lines.append({"ts": ts, "tag": tag, "level": level, "text": message})
    print(f"[sync:{tag}] {message}", flush=True)


def _write_files(user_id: int, result: dict) -> None:
    """Persist the completed sync result to disk."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        all_logs: dict = {}
        if _JSON_FILE.exists():
            try:
                all_logs = json.loads(_JSON_FILE.read_text())
            except Exception:
                pass
        all_logs[str(user_id)] = result
        _JSON_FILE.write_text(json.dumps(all_logs))
    except Exception as e:
        print(f"[sync:system] Failed to write sync_log.json: {e}", flush=True)

    try:
        header = (
            f"=== Sync: {result['started_at']} ===\n"
            f"Duration: {result['duration_seconds']}s  |  "
            f"Movies: {result['movies_synced']} synced, {result['movies_deleted']} deleted  |  "
            f"Shows: {result['shows_synced']} synced, {result['shows_deleted']} deleted\n"
        )
        body = "\n".join(
            f"[{e['ts']}] [{e['tag']}] {e['text']}"
            for e in result["lines"]
        )
        _TEXT_FILE.write_text(header + "\n" + body + "\n")
    except Exception as e:
        print(f"[sync:system] Failed to write sync.log: {e}", flush=True)


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
        _write_files(user_id, _latest[user_id])
        _active.pop(user_id, None)


def get_latest(user_id: int) -> Optional[dict]:
    """Return the latest completed sync log, loading from disk if not in memory."""
    if user_id not in _latest:
        try:
            if _JSON_FILE.exists():
                all_logs = json.loads(_JSON_FILE.read_text())
                if str(user_id) in all_logs:
                    _latest[user_id] = all_logs[str(user_id)]
        except Exception:
            pass
    return _latest.get(user_id)
