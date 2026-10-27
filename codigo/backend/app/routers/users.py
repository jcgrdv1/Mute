import os
import logging
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.config import settings
from app.models.user import User, UserStatus
from app.models.access_log import AccessLog
from app.schemas.user import UserResponse, UserUpdate, UserTemporalUpdate
from app.routers.admin import verify_admin

logger = logging.getLogger('mute.users')

router = APIRouter(prefix='/api', tags=['users'])


class BulkStatusRequest(BaseModel):
    ids: list[UUID]
    status: UserStatus


class BulkBanOldestRequest(BaseModel):
    count: int
    skip: int = 0


@router.get('/users')
async def list_users(
    status: Optional[UserStatus] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin),
):
    count_sub = (
        select(AccessLog.user_id, func.count().label('access_count'))
        .group_by(AccessLog.user_id)
        .subquery()
    )
    query = (
        select(User, func.coalesce(count_sub.c.access_count, 0).label('access_count'))
        .outerjoin(count_sub, User.id == count_sub.c.user_id)
        .order_by(User.created_at.desc())
    )
    if status:
        query = query.where(User.status == status)
    rows = (await db.execute(query)).all()
    result = []
    for user, ac in rows:
        d = UserResponse.model_validate(user).model_dump()
        d['access_count'] = ac
        result.append(d)
    return result


@router.get('/users/{user_id}', response_model=UserResponse)
async def get_user(user_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    return user


@router.patch('/users/{user_id}', response_model=UserResponse)
async def update_user(
    user_id: UUID, data: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    user.status = data.status
    await db.commit()
    await db.refresh(user)
    return user


@router.patch('/users/{user_id}/temporal')
async def set_user_temporal(
    user_id: UUID,
    data: UserTemporalUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')

    if data.valid_date is None or data.valid_date == '':
        user.valid_date = None
    else:
        try:
            user.valid_date = date.fromisoformat(data.valid_date)
        except ValueError:
            raise HTTPException(status_code=400, detail='valid_date debe ser YYYY-MM-DD')

    await db.commit()
    await db.refresh(user)
    return {
        'id': str(user.id),
        'valid_date': user.valid_date.isoformat() if user.valid_date else None,
    }


@router.post('/users/bulk-status')
async def bulk_set_status(
    body: BulkStatusRequest, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)
):
    if not body.ids:
        return {'updated': 0}
    res = await db.execute(update(User).where(User.id.in_(body.ids)).values(status=body.status))
    await db.commit()
    return {'updated': res.rowcount or 0, 'status': body.status.value}


@router.post('/users/ban-oldest')
async def ban_oldest_active(
    body: BulkBanOldestRequest, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)
):
    if body.count <= 0:
        return {'banned': 0, 'ids': []}
    pick_q = (
        select(User.id)
        .where(User.status != UserStatus.banned, User.status != UserStatus.vip)
        .order_by(User.created_at.asc())
        .offset(max(0, body.skip))
        .limit(body.count)
    )
    ids = (await db.execute(pick_q)).scalars().all()
    if not ids:
        return {'banned': 0, 'ids': []}
    await db.execute(update(User).where(User.id.in_(ids)).values(status=UserStatus.banned))
    await db.commit()
    return {'banned': len(ids), 'ids': [str(i) for i in ids]}


@router.delete('/users/{user_id}')
async def delete_user(user_id: UUID, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    await db.delete(user)
    await db.commit()

    foto_path = os.path.join(settings.UPLOAD_DIR, f'{user_id}.jpg')
    try:
        os.remove(foto_path)
    except FileNotFoundError:
        pass
    except OSError as e:
        logger.warning(f'No se pudo borrar foto de {user_id}: {e}')

    return {'detail': 'Usuario eliminado'}
