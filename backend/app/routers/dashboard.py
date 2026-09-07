from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..dashboard_service import get_dashboard
from ..database import get_db


router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=schemas.DashboardResponse)
def dashboard(db: Session = Depends(get_db)):
    return get_dashboard(db)

