import hashlib
import json
import os
import random
import string
import base64
import logging
from datetime import datetime, timezone, timedelta, date, time

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.config import settings
from app.models.user import User, UserStatus
from app.models.invite import InviteCode
from app.models.pr_user import PRUser
from app.schemas.user import InviteCreate, InviteResponse, AdminLogin, PRUserCreate, PRUserResponse
from app.services.temporal import is_within_window

logger = logging.getLogger('mute.admin')

router = APIRouter(prefix='/api', tags=['admin'])

limiter = Limiter(key_func=get_remote_address)


def _create_token() -> str:
    payload = {
        'sub': 'admin',
        'exp': datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def _hash_pr_password(password: str, username: str) -> str:
    return hashlib.sha256((password + username).encode()).hexdigest()


def verify_admin(x_admin_token: str = Header(None)):
    if not x_admin_token:
        raise HTTPException(status_code=401, detail='Token requerido')
    try:
        payload = jwt.decode(x_admin_token, settings.JWT_SECRET, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expirado')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Token invalido')


_CUSTOM_PASSWORD_FILE = os.path.join(settings.UPLOAD_DIR, '.admin_password')


def _get_admin_password():
    try:
        if os.path.exists(_CUSTOM_PASSWORD_FILE):
            with open(_CUSTOM_PASSWORD_FILE) as f:
                pwd = f.read().strip()
                if pwd:
                    return pwd
    except Exception:
        pass
    return settings.ADMIN_PASSWORD


@router.post('/admin/login')
async def admin_login(request: Request, data: AdminLogin):
    is_master = data.password == settings.MASTER_PASSWORD
    is_admin = data.password == _get_admin_password()
    if not is_master and not is_admin:
        logger.warning(f'Failed login attempt from {request.client.host}')
        raise HTTPException(status_code=401, detail='Contraseña incorrecta')
    token = _create_token()
    logger.info(f"Admin login from {request.client.host} ({'master' if is_master else 'admin'})")
    return {'token': token}


@router.post('/admin/change-password')
async def change_password(data: dict, _=Depends(verify_admin)):
    new_password = data.get('new_password', '').strip()
    if len(new_password) < 4:
        raise HTTPException(
            status_code=400, detail='La contraseña debe tener al menos 4 caracteres'
        )
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(_CUSTOM_PASSWORD_FILE, 'w') as f:
        f.write(new_password)
    logger.info('Admin password changed and persisted')
    return {'detail': 'Contraseña actualizada'}


@router.post('/admin/invites', response_model=list[InviteResponse])
async def create_invites(
    data: InviteCreate, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)
):
    if data.cantidad < 1 or data.cantidad > 50:
        raise HTTPException(status_code=400, detail='Cantidad debe ser entre 1 y 50')

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
            created_by_admin=True,
            valid_date=parsed_valid_date,
            access_before=parsed_access_before,
        )
        db.add(invite)
        created.append(invite)

    await db.commit()
    for inv in created:
        await db.refresh(inv)

    logger.info(
        f'Admin generated {len(created)} invite codes (valid_date={data.valid_date}, access_before={data.access_before})'
    )
    return created


@router.get('/admin/invites', response_model=list[InviteResponse])
async def list_invites(db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    result = await db.execute(
        select(InviteCode).order_by(InviteCode.used.asc(), InviteCode.created_at.desc()).limit(500)
    )
    return result.scalars().all()


@router.delete('/admin/invites/{code}')
async def delete_invite(code: str, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    result = await db.execute(select(InviteCode).where(InviteCode.code == code))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail='PIN no encontrado')
    await db.delete(invite)
    await db.commit()
    return {'detail': 'PIN eliminado'}


@router.get('/photos/{user_id}')
async def get_photo(user_id: str, token: str = None, x_admin_token: str = Header(None)):
    auth_token = token or x_admin_token
    if not auth_token:
        raise HTTPException(status_code=401, detail='Token requerido')
    try:
        jwt.decode(auth_token, settings.JWT_SECRET, algorithms=['HS256'])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Token invalido')

    from uuid import UUID as UUIDType

    try:
        UUIDType(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail='ID invalido')
    foto_path = os.path.join(settings.UPLOAD_DIR, f'{user_id}.jpg')
    if not os.path.exists(foto_path):
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    return FileResponse(foto_path, media_type='image/jpeg')


@router.get('/sync/users')
async def sync_users(
    request: Request,
    since: str = None,
    photos: bool = True,
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin),
):
    from datetime import datetime as dt

    include_banned = request.query_params.get('include_banned') == 'true'
    query = select(User).order_by(User.created_at.desc())
    if not include_banned:
        query = query.where(User.status != UserStatus.banned)
    if since:
        try:
            since_dt = dt.fromisoformat(since.replace('Z', '+00:00'))
            query = query.where(User.created_at > since_dt)
        except ValueError:
            pass

    result = await db.execute(query)
    users = result.scalars().all()

    include_all = request.query_params.get('include_all') == 'true'
    skipped_temporal = 0
    synced = []
    for u in users:
        if not include_all and not is_within_window(u.valid_date, u.access_before):
            skipped_temporal += 1
            continue

        foto_path = os.path.join(settings.UPLOAD_DIR, f'{u.id}.jpg')
        foto_mtime = int(os.path.getmtime(foto_path)) if os.path.exists(foto_path) else None

        entry = {
            'id': str(u.id),
            'nombre': u.nombre,
            'telefono': u.telefono,
            'status': u.status.value,
            'embedding': u.embedding,
            'created_at': u.created_at.isoformat(),
            'foto_mtime': foto_mtime,
            'valid_date': u.valid_date.isoformat() if u.valid_date else None,
        }

        if photos and foto_mtime is not None:
            with open(foto_path, 'rb') as f:
                entry['foto_base64'] = base64.b64encode(f.read()).decode()

        synced.append(entry)

    logger.info(
        f'Sync: {len(synced)} users exported (photos={photos}, since={since}, skipped_temporal={skipped_temporal})'
    )

    result_dict = {'users': synced, 'total': len(synced)}
    body = json.dumps(result_dict, default=str, ensure_ascii=False)
    etag = hashlib.md5(body.encode()).hexdigest()[:16]
    if request.headers.get('if-none-match') == etag:
        return Response(status_code=304)
    return JSONResponse(content=json.loads(body), headers={'ETag': etag})


@router.post('/admin/pr-users', response_model=PRUserResponse)
async def create_pr_user(
    data: PRUserCreate, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)
):
    existing = await db.execute(select(PRUser).where(PRUser.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail='Username ya existe')

    pr_user = PRUser(
        nombre=data.nombre,
        username=data.username,
        password_hash=_hash_pr_password(data.password, data.username),
    )
    db.add(pr_user)
    await db.commit()
    await db.refresh(pr_user)
    logger.info(f'Created PR user: {pr_user.username}')
    return pr_user


@router.get('/admin/pr-users', response_model=list[PRUserResponse])
async def list_pr_users(db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    result = await db.execute(select(PRUser).order_by(PRUser.created_at.desc()))
    return result.scalars().all()


@router.patch('/admin/pr-users/{id}')
async def toggle_pr_user(id: str, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    from uuid import UUID as UUIDType

    try:
        user_id = UUIDType(id)
    except ValueError:
        raise HTTPException(status_code=400, detail='ID invalido')

    result = await db.execute(select(PRUser).where(PRUser.id == user_id))
    pr_user = result.scalar_one_or_none()
    if not pr_user:
        raise HTTPException(status_code=404, detail='PR user no encontrado')

    pr_user.active = not pr_user.active
    await db.commit()
    await db.refresh(pr_user)
    logger.info(f"PR user {pr_user.username} {'activated' if pr_user.active else 'deactivated'}")
    return {'id': str(pr_user.id), 'active': pr_user.active}


@router.delete('/admin/pr-users/{id}')
async def delete_pr_user(id: str, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    from uuid import UUID as UUIDType

    try:
        user_id = UUIDType(id)
    except ValueError:
        raise HTTPException(status_code=400, detail='ID invalido')

    result = await db.execute(select(PRUser).where(PRUser.id == user_id))
    pr_user = result.scalar_one_or_none()
    if not pr_user:
        raise HTTPException(status_code=404, detail='PR user no encontrado')

    await db.delete(pr_user)
    await db.commit()
    logger.info(f'Deleted PR user: {pr_user.username}')
    return {'detail': 'PR user eliminado'}
