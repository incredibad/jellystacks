from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter()


def _load(project_id: int, db: Session) -> models.PosterProject:
    p = db.query(models.PosterProject).filter(models.PosterProject.id == project_id).first()
    if not p:
        raise HTTPException(404, "Project not found.")
    return p


@router.get("", response_model=list[schemas.PosterProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.PosterProject)
        .order_by(models.PosterProject.updated_at.desc())
        .all()
    )


@router.post("", response_model=schemas.PosterProjectDetail, status_code=201)
def create_project(
    data: schemas.PosterProjectCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    project = models.PosterProject(
        name=data.name,
        canvas_json=data.canvas_json,
        thumbnail=data.thumbnail,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=schemas.PosterProjectDetail)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return _load(project_id, db)


@router.put("/{project_id}", response_model=schemas.PosterProjectDetail)
def update_project(
    project_id: int,
    data: schemas.PosterProjectUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    project = _load(project_id, db)
    if data.name is not None:
        project.name = data.name
    if data.canvas_json is not None:
        project.canvas_json = data.canvas_json
    if data.thumbnail is not None:
        project.thumbnail = data.thumbnail
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    project = _load(project_id, db)
    db.delete(project)
    db.commit()
