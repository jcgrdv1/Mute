import asyncio
import base64
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.config import settings
from app.models.user import User
from app.models.invite import InviteCode
from app.schemas.user import UserCreate, UserResponse
from app.services.face import get_face_embedding
from app.services.cache import load_cache

router = APIRouter(prefix='/api', tags=['register'])
limiter = Limiter(key_func=get_remote_address)


@router.post('/register', response_model=UserResponse)
@limiter.limit('30/minute')
async def register_user(request: Request, data: UserCreate, db: AsyncSession = Depends(get_db)):
    if len(data.nombre) > 100:
        raise HTTPException(status_code=400, detail='Nombre demasiado largo')
    if len(data.telefono) > 20:
        raise HTTPException(status_code=400, detail='Telefono demasiado largo')
    if len(data.pin) != 6 or not data.pin.isdigit():
        raise HTTPException(status_code=400, detail='PIN debe ser 6 digitos')

    if len(data.foto_base64) > 14_000_000:
        raise HTTPException(status_code=400, detail='Imagen demasiado grande (max 10MB)')

    result = await db.execute(
        select(InviteCode).where(InviteCode.code == data.pin, InviteCode.used == False)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=403, detail='PIN invalido o ya utilizado')

    existing = (
        await db.execute(select(User).where(User.telefono == data.telefono))
    ).scalar_one_or_none()
    # si ya estaba registrado igual se quema el pin
    if existing:
        invite.used = True
        invite.used_by = existing.id
        invite.used_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=409,
            detail={
                'already_registered': True,
                'nombre': existing.nombre,
                'message': 'Ya estas registrado',
            },
        )

    try:
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(None, get_face_embedding, data.foto_base64)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    user = User(
        nombre=data.nombre,
        telefono=data.telefono,
        embedding=embedding,
        invite_code_used=invite.code,
        invited_by_pr_id=invite.created_by_pr_id,
        valid_date=invite.valid_date,
        access_before=invite.access_before,
    )
    db.add(user)
    await db.flush()

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    foto_path = os.path.join(settings.UPLOAD_DIR, f'{user.id}.jpg')
    foto_data = data.foto_base64
    if ',' in foto_data:
        foto_data = foto_data.split(',', 1)[1]
    with open(foto_path, 'wb') as f:
        f.write(base64.b64decode(foto_data))
    user.foto_url = f'/api/photos/{user.id}'

    invite.used = True
    invite.used_by = user.id
    invite.used_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)

    await load_cache(db)

    return user
