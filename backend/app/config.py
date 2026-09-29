"""Application configuration loaded from environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./nadir.db"

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── File storage ──────────────────────────────────────────────────────
    UPLOAD_DIR: str = "storage/uploads"

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p

    # ── ML Model ──────────────────────────────────────────────────────────
    MODEL_PATH: str = "new.pt"
    USE_STUB_MODEL: bool = False

    # ── Acoustic denoising ────────────────────────────────────────────────
    # Applied to each sonar channel before the waterfall is sliced into JPG tiles.
    DENOISE_ENABLED: bool = True
    # One filter, or an ordered chain joined by "+": lee | median | bilateral | nlm |
    # wavelet | none. Default "lee+bilateral" matches how the deployed weights were
    # trained; changing it changes the image statistics the model sees at inference.
    # "bilateral" needs opencv-python; "nlm"/"wavelet" need scikit-image.
    DESPECKLE_METHOD: str = "lee+bilateral"
    DESPECKLE_FILTER_SIZE: int = 5
    DENOISE_BEAM_PATTERN: bool = True
    DENOISE_DESTRIPE: bool = True
    DENOISE_REPAIR_BAD_PINGS: bool = True


settings = Settings()
