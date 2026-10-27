import hashlib
import logging
import random
import string
from datetime import datetime, timezone, timedelta, date, time

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.models.pr_user import PRUser
from app.models.invite import InviteCode
from app.models.user import User
from app.schemas.user import PRUserLogin, InviteCreateV2, InviteResponseV2

logger = logging.getLogger('mute.pr')

router = APIRouter(prefix='/api/pr', tags=['pr'])


def _hash_password(password: str, username: str) -> str:
    return hashlib.sha256((password + username).encode()).hexdigest()


def _create_pr_token(pr_user: PRUser) -> str:
    payload = {
        'sub': f'pr:{pr_user.username}',
        'pr_id': str(pr_user.id),
        'exp': datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def verify_pr(x_admin_token: str = Header(None)) -> dict:
    if not x_admin_token:
        raise HTTPException(status_code=401, detail='Token requerido')
    try:
        payload = jwt.decode(x_admin_token, settings.JWT_SECRET, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expirado')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Token invalido')

    sub = payload.get('sub', '')
    if not sub.startswith('pr:'):
        raise HTTPException(status_code=403, detail='Acceso solo para usuarios PR')
    return payload


@router.post('/login')
async def pr_login(data: PRUserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PRUser).where(PRUser.username == data.username))
    pr_user = result.scalar_one_or_none()
    if not pr_user:
        raise HTTPException(status_code=401, detail='Credenciales incorrectas')

    if not pr_user.active:
        raise HTTPException(status_code=403, detail='Usuario PR desactivado')

    expected_hash = _hash_password(data.password, data.username)
    if pr_user.password_hash != expected_hash:
        raise HTTPException(status_code=401, detail='Credenciales incorrectas')

    token = _create_pr_token(pr_user)
    logger.info(f'PR login: {pr_user.username}')
    return {'token': token, 'nombre': pr_user.nombre, 'username': pr_user.username}


@router.get('/invites', response_model=list[InviteResponseV2])
async def list_pr_invites(
    db: AsyncSession = Depends(get_db), pr_payload: dict = Depends(verify_pr)
):
    pr_id = pr_payload['pr_id']
    result = await db.execute(
        select(InviteCode)
        .where(InviteCode.created_by_pr_id == pr_id)
        .order_by(InviteCode.created_at.desc())
    )
    return result.scalars().all()


@router.post('/invites', response_model=list[InviteResponseV2])
async def create_pr_invites(
    data: InviteCreateV2, db: AsyncSession = Depends(get_db), pr_payload: dict = Depends(verify_pr)
):
    if data.cantidad < 1 or data.cantidad > 50:
        raise HTTPException(status_code=400, detail='Cantidad debe ser entre 1 y 50')

    pr_id = pr_payload['pr_id']

    parsed_valid_date = None
    if data.valid_date:
        try:
            parsed_valid_date = date.fromisoformat(data.valid_date)
        except ValueError:
            raise HTTPException(status_code=400, detail='valid_date debe ser YYYY-MM-DD')

    parsed_access_before = None
    if data.access_before:
        try:
            parts = data.access_before.split(':')
            parsed_access_before = time(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail='access_before debe ser HH:MM')

    created = []
    for _ in range(data.cantidad):
        code = ''.join(random.choices(string.digits, k=6))
        while True:
            existing = await db.execute(select(InviteCode).where(InviteCode.code == code))
            if not existing.scalar_one_or_none():
                break
            code = ''.join(random.choices(string.digits, k=6))

        invite = InviteCode(
            code=code,
            created_by_admin=False,
            created_by_pr_id=pr_id,
            valid_date=parsed_valid_date,
            access_before=parsed_access_before,
        )
        db.add(invite)
        created.append(invite)

    await db.commit()
    for inv in created:
        await db.refresh(inv)

    logger.info(f"PR {pr_payload['sub']} generated {len(created)} invite codes")
    return created


@router.get('/stats')
async def pr_stats(db: AsyncSession = Depends(get_db), pr_payload: dict = Depends(verify_pr)):
    pr_id = pr_payload['pr_id']

    total_result = await db.execute(
        select(func.count()).select_from(InviteCode).where(InviteCode.created_by_pr_id == pr_id)
    )
    total_invites = total_result.scalar()

    used_result = await db.execute(
        select(func.count())
        .select_from(InviteCode)
        .where(InviteCode.created_by_pr_id == pr_id, InviteCode.used == True)
    )
    used_invites = used_result.scalar()

    registered_result = await db.execute(
        select(func.count()).select_from(User).where(User.invited_by_pr_id == pr_id)
    )
    registered_users = registered_result.scalar()

    return {
        'total_invites': total_invites,
        'used_invites': used_invites,
        'registered_users': registered_users,
    }
