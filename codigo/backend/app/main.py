import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import engine, Base
from app.routers import register, verify, users, admin, pr, reports
from app.routers.admin import verify_admin

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger('mute')


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('Starting Mute Face ID')
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        logger.warning(f'DB init (may be OK if tables exist): {e}')
    logger.info('Database tables ready')
    yield
    logger.info('Shutting down')


app = FastAPI(title='Mute Face ID', version='1.0.0', lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(','),
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=['*'],
)

app.include_router(register.router)
app.include_router(verify.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(pr.router)
app.include_router(reports.router)


@app.post('/api/admin/login-limited')
@limiter.limit('5/minute')
async def login_rate_limited(request: Request):
    pass


@app.get('/')
async def root():
    return {'app': 'Mute Face ID', 'status': 'running'}


@app.get('/health')
async def health():
    return {'status': 'ok'}


_recent_kiosk_logs = []
_last_kiosk_ping = 0


@app.post('/api/kiosk-logs')
async def receive_kiosk_logs(request: Request):
    global _last_kiosk_ping
    import time as _time

    _last_kiosk_ping = _time.time()
    data = await request.json()
    logs = data.get('logs', [])
    for log in logs:
        logger.info(f'[KIOSK] {log}')
        _recent_kiosk_logs.append(log)
    while len(_recent_kiosk_logs) > 100:
        _recent_kiosk_logs.pop(0)
    return {'received': len(logs)}


@app.get('/api/kiosk-logs/recent')
async def get_recent_logs():
    import time as _time

    ago = int(_time.time() - _last_kiosk_ping) if _last_kiosk_ping else -1
    return {'logs': _recent_kiosk_logs[-50:], 'last_ping_seconds_ago': ago}


_bridge_status = {
    'last_heartbeat': 0,
    'last_sync_ok': False,
    'last_successful_sync': 0,
    'terminals': {},
    'pending_retries': 0,
    'total_users': 0,
    'error': None,
    'recent_events': [],
}


@app.post('/api/bridge/heartbeat')
async def bridge_heartbeat(request: Request, _=Depends(verify_admin)):
    import time as _time

    data = await request.json()
    _bridge_status['last_heartbeat'] = _time.time()
    _bridge_status['last_sync_ok'] = bool(data.get('last_sync_ok', False))
    if _bridge_status['last_sync_ok']:
        _bridge_status['last_successful_sync'] = _time.time()
    _bridge_status['terminals'] = data.get('terminals', {}) or {}
    _bridge_status['pending_retries'] = int(data.get('pending_retries', 0))
    _bridge_status['total_users'] = int(data.get('total_users', 0))
    _bridge_status['error'] = data.get('error')
    events = data.get('recent_events', [])
    if isinstance(events, list):
        _bridge_status['recent_events'] = events[-30:]
    return {'received': True}


@app.get('/api/bridge/status')
async def get_bridge_status(_=Depends(verify_admin)):
    import time as _time

    now = _time.time()
    ago = int(now - _bridge_status['last_heartbeat']) if _bridge_status['last_heartbeat'] else -1
    sync_ago = (
        int(now - _bridge_status['last_successful_sync'])
        if _bridge_status['last_successful_sync']
        else -1
    )
    return {
        **_bridge_status,
        'last_heartbeat_seconds_ago': ago,
        'last_successful_sync_seconds_ago': sync_ago,
    }


TERMINAL_FACE_CAP = 1500
TERMINAL_WARN_AT = 1450


@app.get('/api/admin/capacity')
async def get_capacity(_=Depends(verify_admin)):
    from sqlalchemy import select, func
    from app.database import async_session
    from app.models.user import User, UserStatus

    async with async_session() as db:
        active_count = (
            await db.execute(select(func.count(User.id)).where(User.status != UserStatus.banned))
        ).scalar_one()
        banned_count = (
            await db.execute(select(func.count(User.id)).where(User.status == UserStatus.banned))
        ).scalar_one()

    def _level(n):
        if n >= TERMINAL_FACE_CAP:
            return 'critical'
        if n >= TERMINAL_WARN_AT:
            return 'warning'
        return 'ok'

    terminals = {}
    for tkey, td in (_bridge_status.get('terminals') or {}).items():
        synced = td.get('synced_count', 0)
        terminals[tkey] = {
            'name': td.get('name', tkey),
            'synced_count': synced,
            'free_slots': max(0, TERMINAL_FACE_CAP - synced),
            'level': _level(synced),
        }

    overall_level = _level(active_count)
    if any(t['level'] == 'critical' for t in terminals.values()):
        overall_level = 'critical'
    elif overall_level == 'ok' and any(t['level'] == 'warning' for t in terminals.values()):
        overall_level = 'warning'

    return {
        'terminal_cap': TERMINAL_FACE_CAP,
        'warn_at': TERMINAL_WARN_AT,
        'active_users': active_count,
        'banned_users': banned_count,
        'free_in_db': max(0, TERMINAL_FACE_CAP - active_count),
        'level': overall_level,
        'terminals': terminals,
    }
