import logging
import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

logger = logging.getLogger('mute.cache')

_cache = {'users': [], 'embeddings': None, 'version': 0}


async def load_cache(db: AsyncSession):
    result = await db.execute(select(User))
    users = result.scalars().all()
    if users:
        _cache['users'] = users
        _cache['embeddings'] = np.array([u.embedding for u in users])
    else:
        _cache['users'] = []
        _cache['embeddings'] = None
    _cache['version'] += 1
    logger.info(f"Cache loaded: {len(_cache['users'])} users (v{_cache['version']})")


def get_cached_users():
    return _cache['users']


def is_cache_empty():
    return not _cache['users']
