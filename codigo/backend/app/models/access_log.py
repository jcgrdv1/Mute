import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, ForeignKey, BigInteger, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AccessLog(Base):
    __tablename__ = 'access_logs'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True
    )
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    status_at_scan: Mapped[str] = mapped_column(String(20), nullable=False)

    terminal_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    event_serial: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    event_minor: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
