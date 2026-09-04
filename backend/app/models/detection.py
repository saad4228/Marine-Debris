"""Detection ORM model — a single detected object on the seabed."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # e.g. NDR-0001
    cls: Mapped[str] = mapped_column(String(50), nullable=False)  # tyre, drum, container, ghost-net, chain, unknown
    conf: Mapped[float] = mapped_column(Float, nullable=False)  # 0.0 – 1.0

    # Normalised bounding box (fractions of image)
    x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    w: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    h: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Sonar geometry
    side: Mapped[str | None] = mapped_column(String(20), nullable=True)  # port / starboard
    range_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    depth_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Geo-referenced position
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Echo & shadow measurements
    echo_len_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    shadow_len_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_est_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Survey reference
    line: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ping: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Review status
    status: Mapped[str] = mapped_column(String(50), default="Candidate")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Source image
    image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # FK to survey (nullable — detections from Upload page won't have one)
    survey_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("surveys.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    survey: Mapped["Survey | None"] = relationship(back_populates="detections")  # noqa: F821
    reviews: Mapped[list["Review"]] = relationship(  # noqa: F821
        back_populates="detection",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Detection id={self.id!r} cls={self.cls!r} conf={self.conf:.2f}>"
