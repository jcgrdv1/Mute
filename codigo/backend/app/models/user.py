import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, JSON, Time, Date, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.database import Base


class UserStatus(str, enum.Enum):
    registered = 'registered'
    vip = 'vip'
    banned = 'banned'


class User(Base):
    __tablename__ = 'users'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    telefono: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    foto_url: Mapped[str] = mapped_column(String(500), nullable=True)
    embedding: Mapped[list] = mapped_column(JSON, nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        SAEnum(UserStatus), default=UserStatus.registered, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    invited_by_pr_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey('pr_users.id'), nullable=True
    )
    invite_code_used: Mapped[str] = mapped_column(String(10), nullable=True)
    valid_date = mapped_column(Date, nullable=True)
    access_before = mapped_column(Time, nullable=True)
