# Claude Code Instructions

## Versioning

**Always bump the version in `frontend/package.json` before every commit.** (The backend is Python and has no `package.json` — the single source of version truth is the frontend package.)

- Bug fixes and visual/UI changes → patch bump (1.x.**Y**)
- New features or behaviour changes → minor bump (1.**Y**.0)

This is non-negotiable — no commit should go out without a version increment in `frontend/package.json`.

## Changelog

**Always update `CHANGELOG.md` before every commit.** Add an entry under the correct version heading (create one if it doesn't exist, using the format `## [x.y.z] — YYYY-MM-DD`) that describes the change concisely. Use `### Added`, `### Changed`, or `### Fixed` sub-sections to match the existing style.

This is non-negotiable — no commit should go out without a changelog entry.

## Pushing

**Never push to the remote repository.** Always commit locally and let the user push manually.
