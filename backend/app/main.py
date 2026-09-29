"""Main FastAPI application for NADIR — Side-Scan Sonar Seabed Object Detection."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_v1_router
from app.config import settings
from app.core.database import create_tables, dispose_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nadir")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Initializing NADIR backend...")
    # Ensure storage directories exist
    Path("storage/tiles").mkdir(parents=True, exist_ok=True)
    Path("storage/uploads").mkdir(parents=True, exist_ok=True)
    Path("storage/exports").mkdir(parents=True, exist_ok=True)

    # Attempt to initialize tables (PostgreSQL or local SQLite fallback)
    try:
        await create_tables()
        logger.info("Database tables verified/created.")
    except Exception as e:
        logger.warning(
            "Could not connect to database on startup (%s). Backend will continue in lightweight mode.",
            e,
        )

    yield

    logger.info("Shutting down NADIR backend...")
    await dispose_engine()


app = FastAPI(
    title="NADIR API",
    description="Side-Scan Sonar Debris & Underwater Target Detection Pipeline (SIH 2026)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static file directory for serving extracted JPG tiles and uploads
storage_path = Path("storage")
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_path)), name="storage")

# Mount API v1 router
app.include_router(api_v1_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "name": "NADIR Sonar Inference & Catalogue API",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "online",
        "stub_model_active": settings.USE_STUB_MODEL,
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
