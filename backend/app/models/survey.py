"""Survey line ORM model — metadata about an ingested sonar survey line."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Survey(Base):
    __tablename__ = "surveys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    line: Mapped[str] = mapped_column(String(50), nullable=False)
    sensor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    frequency_khz: Mapped[float | None] = mapped_column(Float, nullable=True)
    ping_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    altitude_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Survey extent
    start_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    start_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_lon: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship: a survey has many detections
    detections: Mapped[list["Detection"]] = relationship(  # noqa: F821
        back_populates="survey",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Survey id={self.id} name={self.name!r} line={self.line!r}>"
