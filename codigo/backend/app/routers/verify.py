import time
import asyncio
import logging
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.user import User
from app.schemas.user import VerifyRequest, VerifyResponse, UserResponse, FaceBox, FaceResult
from app.services.face import get_all_faces, compare_embeddings
from app.services.cache import load_cache, get_cached_users, is_cache_empty
from app.config import settings

logger = logging.getLogger('mute.verify')

router = APIRouter(prefix='/api', tags=['verify'])
limiter = Limiter(key_func=get_remote_address)


@router.post('/verify', response_model=VerifyResponse)
@limiter.limit('30/minute')
async def verify_user(request: Request, data: VerifyRequest, db: AsyncSession = Depends(get_db)):
    t0 = time.time()

    if len(data.foto_base64) > 14_000_000:
        raise HTTPException(status_code=400, detail='Imagen demasiado grande')

    try:
        loop = asyncio.get_event_loop()
        detected_faces = await loop.run_in_executor(None, get_all_faces, data.foto_base64)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    t_face = time.time()

    if is_cache_empty():
        await load_cache(db)

    users = get_cached_users()
    known_embeddings = [u.embedding for u in users] if users else []

    face_results = []
    for embedding, box in detected_faces:
        match_index, distance = compare_embeddings(
            embedding, known_embeddings, tolerance=settings.MAX_FACE_DISTANCE
        )

        if match_index is not None:
            matched_user = users[match_index]
            face_results.append(
                FaceResult(
                    match=True,
                    usuario=UserResponse.model_validate(matched_user),
                    distancia=distance,
                    face_box=FaceBox(**box),
                )
            )
        else:
            face_results.append(FaceResult(match=False, face_box=FaceBox(**box)))

    t_total = time.time()
    logger.info(
        f'faces={len(detected_faces)} detect={int((t_face-t0)*1000)}ms match={int((t_total-t_face)*1000)}ms total={int((t_total-t0)*1000)}ms'
    )

    return VerifyResponse(faces=face_results)


@router.post('/verify/reload-cache')
async def reload_cache_endpoint(db: AsyncSession = Depends(get_db)):
    await load_cache(db)
    return {'cached_users': len(get_cached_users())}


class PhoneCheck(BaseModel):
    telefono: str


@router.post('/verify-phone')
@limiter.limit('60/minute')
async def verify_phone(request: Request, body: PhoneCheck, db: AsyncSession = Depends(get_db)):
    tel = (body.telefono or '').strip()
    if not tel:
        raise HTTPException(status_code=400, detail='Telefono requerido')
    if len(tel) > 20:
        raise HTTPException(status_code=400, detail='Telefono demasiado largo')

    u = (await db.execute(select(User).where(User.telefono == tel))).scalar_one_or_none()
    if not u:
        return {'registered': False}
    return {'registered': True, 'nombre': u.nombre, 'status': u.status.value}
