"""Review ORM model — analyst review records attached to detections."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    detection_id: Mapped[str] = mapped_column(
        String(20), ForeignKey("detections.id", ondelete="CASCADE"), nullable=False
    )
    reviewer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # Confirmed / Rejected / Candidate
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    detection: Mapped["Detection"] = relationship(back_populates="reviews")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Review id={self.id} detection={self.detection_id!r} status={self.status!r}>"
