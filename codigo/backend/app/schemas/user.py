from pydantic import BaseModel
from uuid import UUID
from datetime import datetime, date, time
from typing import Optional

from app.models.user import UserStatus


class UserCreate(BaseModel):
    nombre: str
    telefono: str
    foto_base64: str
    pin: str


class UserResponse(BaseModel):
    id: UUID
    nombre: str
    telefono: str
    foto_url: Optional[str] = None
    status: UserStatus
    created_at: datetime
    valid_date: Optional[date] = None
    access_before: Optional[time] = None
    invite_code_used: Optional[str] = None
    invited_by_pr_id: Optional[UUID] = None
    access_count: int = 0

    model_config = {'from_attributes': True}


class VerifyRequest(BaseModel):
    foto_base64: str


class FaceBox(BaseModel):
    top: float
    right: float
    bottom: float
    left: float


class FaceResult(BaseModel):
    match: bool
    usuario: Optional[UserResponse] = None
    distancia: Optional[float] = None
    face_box: FaceBox


class VerifyResponse(BaseModel):
    faces: list[FaceResult]


class UserUpdate(BaseModel):
    status: UserStatus


class UserTemporalUpdate(BaseModel):
    valid_date: Optional[str] = None


class InviteCreate(BaseModel):
    cantidad: int = 1
    valid_date: Optional[str] = None
    access_before: Optional[str] = None


class InviteResponse(BaseModel):
    id: UUID
    code: str
    used: bool
    used_by: Optional[UUID] = None
    created_at: datetime
    used_at: Optional[datetime] = None
    created_by_admin: bool = True
    valid_date: Optional[date] = None
    access_before: Optional[time] = None

    model_config = {'from_attributes': True}


class AdminLogin(BaseModel):
    password: str


class PRUserCreate(BaseModel):
    nombre: str
    username: str
    password: str


class PRUserResponse(BaseModel):
    id: UUID
    nombre: str
    username: str
    active: bool
    created_at: datetime
    model_config = {'from_attributes': True}


class PRUserLogin(BaseModel):
    username: str
    password: str


class AccessLogCreate(BaseModel):
    user_id: UUID
    scanned_at: str


class AccessLogBatch(BaseModel):
    logs: list[AccessLogCreate]


class AccessLogResponse(BaseModel):
    id: UUID
    user_id: UUID
    scanned_at: datetime
    status_at_scan: str
    model_config = {'from_attributes': True}


class TerminalEventIn(BaseModel):
    terminal_ip: str
    event_serial: int
    event_minor: int
    event_time: str
    employee_no: Optional[str] = None
    name: Optional[str] = None


class TerminalEventBatch(BaseModel):
    events: list[TerminalEventIn]


class InviteCreateV2(BaseModel):
    cantidad: int = 1
    valid_date: Optional[str] = None
    access_before: Optional[str] = None


class InviteResponseV2(BaseModel):
    id: UUID
    code: str
    used: bool
    used_by: Optional[UUID] = None
    created_at: datetime
    used_at: Optional[datetime] = None
    created_by_admin: bool
    created_by_pr_id: Optional[UUID] = None
    valid_date: Optional[date] = None
    access_before: Optional[time] = None
    model_config = {'from_attributes': True}
