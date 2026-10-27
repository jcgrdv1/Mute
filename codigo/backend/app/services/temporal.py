from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

VENUE_TZ = ZoneInfo('America/Mexico_City')
# la noche empieza 9pm y por default acaba 4am hora cdmx
NIGHT_START = time(21, 0)
DEFAULT_NIGHT_END = time(4, 0)


def temporal_window(valid_date, access_before=None):
    end_time = access_before or DEFAULT_NIGHT_END
    start_local = datetime.combine(valid_date, NIGHT_START, tzinfo=VENUE_TZ)
    end_date = valid_date + timedelta(days=1) if end_time < NIGHT_START else valid_date
    end_local = datetime.combine(end_date, end_time, tzinfo=VENUE_TZ)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def is_within_window(valid_date, access_before=None, now_utc=None):
    if valid_date is None:
        return True
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    start, end = temporal_window(valid_date, access_before)
    return start <= now_utc <= end
