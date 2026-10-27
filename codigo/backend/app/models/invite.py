import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, Date, Time, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class InviteCode(Base):
    __tablename__ = 'invite_codes'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_admin: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_pr_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey('pr_users.id'), nullable=True
    )
    valid_date = mapped_column(Date, nullable=True)
    access_before = mapped_column(Time, nullable=True)
