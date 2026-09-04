"""API v1 router registry."""

from fastapi import APIRouter

from app.api.v1.endpoints import detect, detections, exports, stats, surveys

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(detect.router, prefix="/detect", tags=["Inference"])
api_v1_router.include_router(detections.router, prefix="/detections", tags=["Detections Catalogue"])
api_v1_router.include_router(surveys.router, prefix="/surveys", tags=["Survey Lines"])
api_v1_router.include_router(exports.router, prefix="/exports", tags=["Exports"])
api_v1_router.include_router(stats.router, prefix="/stats", tags=["Evaluation & Stats"])
