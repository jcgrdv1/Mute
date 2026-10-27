import csv
import io
import logging
import uuid
from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, and_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.access_log import AccessLog
from app.models.user import User
from app.models.invite import InviteCode
from app.models.pr_user import PRUser
from app.routers.admin import verify_admin
from app.schemas.user import AccessLogBatch, TerminalEventBatch
from app.services.temporal import VENUE_TZ, temporal_window

logger = logging.getLogger('mute.reports')

router = APIRouter(prefix='/api', tags=['reports'])


def _night_window_utc(report_date: date):
    return temporal_window(report_date)


def _employee_no_to_uuid(emp_no: str):
    if not emp_no:
        return None
    s = emp_no.strip().lower()
    if len(s) != 32:
        return None
    try:
        return uuid.UUID(s)
    except ValueError:
        return None


@router.post('/access-log')
async def receive_access_logs(
    data: AccessLogBatch, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)
):
    saved = 0
    skipped = 0

    for log_entry in data.logs:
        try:
            scanned_dt = datetime.fromisoformat(log_entry.scanned_at)
        except ValueError:
            skipped += 1
            continue

        if scanned_dt.tzinfo is None:
            scanned_dt = scanned_dt.replace(tzinfo=timezone.utc)

        scan_date = scanned_dt.date()

        existing = await db.execute(
            select(AccessLog).where(
                AccessLog.user_id == log_entry.user_id, func.date(AccessLog.scanned_at) == scan_date
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        user_result = await db.execute(select(User).where(User.id == log_entry.user_id))
        user = user_result.scalar_one_or_none()
        status_at_scan = user.status.value if user else 'unknown'

        access_log = AccessLog(
            user_id=log_entry.user_id, scanned_at=scanned_dt, status_at_scan=status_at_scan
        )
        db.add(access_log)
        saved += 1

    await db.commit()
    logger.info(f'Access logs (legacy): {saved} saved, {skipped} skipped')
    return {'saved': saved, 'skipped': skipped}


@router.post('/terminal-events')
async def receive_terminal_events(
    data: TerminalEventBatch, db: AsyncSession = Depends(get_db), _=Depends(verify_admin)
):
    saved = 0
    skipped_dup = 0
    invalid = 0

    for ev in data.events:
        try:
            scanned_dt = datetime.fromisoformat(ev.event_time)
        except ValueError:
            invalid += 1
            continue
        if scanned_dt.tzinfo is None:
            scanned_dt = scanned_dt.replace(tzinfo=timezone.utc)
        scanned_dt = scanned_dt.astimezone(timezone.utc)

        user_id = _employee_no_to_uuid(ev.employee_no) if ev.employee_no else None
        status_at_scan = 'unknown'
        if user_id is not None:
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if user:
                status_at_scan = user.status.value
            else:
                user_id = None
                status_at_scan = 'deleted'

        stmt = (
            pg_insert(AccessLog)
            .values(
                user_id=user_id,
                scanned_at=scanned_dt,
                status_at_scan=status_at_scan,
                terminal_ip=ev.terminal_ip,
                event_serial=ev.event_serial,
                event_minor=ev.event_minor,
                raw_name=(ev.name[:128] if ev.name else None),
            )
            .on_conflict_do_nothing(index_elements=['terminal_ip', 'event_serial'])
            .returning(AccessLog.id)
        )
        result = await db.execute(stmt)
        if result.scalar_one_or_none() is not None:
            saved += 1
        else:
            skipped_dup += 1

    await db.commit()
    logger.info(f'Terminal events: {saved} saved, {skipped_dup} dupes, {invalid} invalid')
    return {'saved': saved, 'skipped_duplicates': skipped_dup, 'invalid': invalid}


@router.get('/admin/reports')
async def daily_report(
    date: str = Query(
        default=None,
        description='Date in YYYY-MM-DD format (start of nightclub night, venue local time)',
    ),
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin),
):
    if date:
        try:
            report_date = datetime.strptime(date, '%Y-%m-%d').date()
        except ValueError:
            raise HTTPException(status_code=400, detail='Formato de fecha invalido. Use YYYY-MM-DD')
    else:
        report_date = datetime.now(VENUE_TZ).date()
        # antes de las 9 de la noche saca el de anoche
        if datetime.now(VENUE_TZ).hour < 21:
            report_date = report_date - timedelta(days=1)

    start_utc, end_utc = _night_window_utc(report_date)

    result = await db.execute(
        select(AccessLog)
        .where(and_(AccessLog.scanned_at >= start_utc, AccessLog.scanned_at <= end_utc))
        .order_by(AccessLog.scanned_at)
    )
    logs = result.scalars().all()

    matched_logs = [l for l in logs if l.event_minor in (None, 75)]
    unmatched_logs = [l for l in logs if l.event_minor == 76]

    visitors = []
    user_ids = []
    seen_uids = set()
    for log in matched_logs:
        if log.user_id and log.user_id not in seen_uids:
            seen_uids.add(log.user_id)
            user_ids.append(log.user_id)

    users_by_id = {}
    if user_ids:
        ur = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_by_id = {u.id: u for u in ur.scalars().all()}

    for uid in user_ids:
        user = users_by_id.get(uid)
        user_logs = [l for l in matched_logs if l.user_id == uid]
        nombre = user.nombre if user else (user_logs[0].raw_name or 'Desconocido')
        visitors.append(
            {
                'user_id': str(uid),
                'nombre': nombre,
                'telefono': user.telefono if user else '',
                'status': user.status.value if user else 'deleted',
                'first_seen': user_logs[0].scanned_at.isoformat(),
                'times_seen': len(user_logs),
            }
        )

    orphan_groups = {}
    for log in matched_logs:
        if log.user_id is None:
            key = (log.raw_name or 'Sin nombre').strip()
            g = orphan_groups.setdefault(
                key, {'nombre': key, 'first_seen': log.scanned_at, 'times_seen': 0}
            )
            g['times_seen'] += 1
            if log.scanned_at < g['first_seen']:
                g['first_seen'] = log.scanned_at

    for g in orphan_groups.values():
        visitors.append(
            {
                'user_id': None,
                'nombre': g['nombre'],
                'telefono': '',
                'status': 'deleted',
                'first_seen': g['first_seen'].isoformat(),
                'times_seen': g['times_seen'],
            }
        )

    visitors.sort(key=lambda v: v['first_seen'])

    return {
        'date': str(report_date),
        'night_start': start_utc.isoformat(),
        'night_end': end_utc.isoformat(),
        'total_accesses': len(matched_logs),
        'unique_visitors': len(visitors),
        'unrecognized_attempts': len(unmatched_logs),
        'visitors': visitors,
    }


@router.get('/admin/reports/top')
async def top_visitors(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _=Depends(verify_admin),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(AccessLog.user_id, func.count(AccessLog.id).label('visit_count'))
        .where(AccessLog.scanned_at >= since)
        .where(AccessLog.user_id.is_not(None))
        .group_by(AccessLog.user_id)
        .order_by(func.count(AccessLog.id).desc())
        .limit(50)
    )
    rows = result.all()

    top = []
    for user_id, visit_count in rows:
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        top.append(
            {
                'user_id': str(user_id),
                'nombre': user.nombre if user else 'Unknown',
                'telefono': user.telefono if user else '',
                'status': user.status.value if user else 'unknown',
                'visit_count': visit_count,
            }
        )

    return {'days': days, 'top_visitors': top}


@router.get('/admin/export')
async def export_csv(db: AsyncSession = Depends(get_db), _=Depends(verify_admin)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    pr_result = await db.execute(select(PRUser))
    pr_users = {str(pr.id): pr for pr in pr_result.scalars().all()}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            'id',
            'nombre',
            'telefono',
            'status',
            'created_at',
            'invite_code_used',
            'invited_by_pr_id',
            'invited_by_pr_name',
            'access_before',
        ]
    )

    for u in users:
        pr_name = ''
        if u.invited_by_pr_id:
            pr = pr_users.get(str(u.invited_by_pr_id))
            pr_name = pr.nombre if pr else ''

        writer.writerow(
            [
                str(u.id),
                u.nombre,
                u.telefono,
                u.status.value,
                u.created_at.isoformat(),
                u.invite_code_used or '',
                str(u.invited_by_pr_id) if u.invited_by_pr_id else '',
                pr_name,
                str(u.access_before) if u.access_before else '',
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename=users_export.csv'},
    )
