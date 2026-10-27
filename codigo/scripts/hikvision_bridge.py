import json
import time
import base64
import logging
import logging.handlers
import os
import sys
import io
import uuid as _uuid
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import httpx
except ImportError:
    print('Installing httpx...')
    os.system(f'{sys.executable} -m pip install httpx')
    import httpx

CONFIG_PATH = Path(__file__).parent / 'bridge_config.json'
SYNCED_FILE = Path(__file__).parent / 'bridge_synced.json'
LOG_FILE = Path(__file__).parent / 'bridge.log'

_log_formatter = logging.Formatter('%(asctime)s [%(name)s] %(message)s', datefmt='%H:%M:%S')
_file_handler = logging.handlers.RotatingFileHandler(
    LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding='utf-8'
)
_file_handler.setFormatter(_log_formatter)
_stream_handler = logging.StreamHandler()
_stream_handler.setFormatter(_log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])
log = logging.getLogger('bridge')


def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


_TOKEN_CACHE = {'token': None, 'obtained_at': 0.0}
_TOKEN_TTL_SEC = 6 * 3600
_TOKEN_LOCK = threading.Lock()


def _login(cfg):
    for attempt in range(3):
        try:
            r = httpx.post(
                f"{cfg['server_url']}/api/admin/login",
                json={'password': cfg['admin_password']},
                timeout=10,
            )
            r.raise_for_status()
            return r.json()['token']
        except Exception as e:
            if attempt < 2:
                time.sleep(2**attempt)
            else:
                log.error(f'Login failed after 3 attempts: {e}')
                raise


def get_jwt_token(cfg, force=False):
    with _TOKEN_LOCK:
        now = time.time()
        cached = _TOKEN_CACHE['token']
        fresh = (now - _TOKEN_CACHE['obtained_at']) < _TOKEN_TTL_SEC
        if cached and fresh and not force:
            return cached
        token = _login(cfg)
        _TOKEN_CACHE['token'] = token
        _TOKEN_CACHE['obtained_at'] = now
        return token


def get_server_users(cfg, token):
    for attempt in range(3):
        try:
            r = httpx.get(
                f"{cfg['server_url']}/api/sync/users?photos=false",
                headers={'X-Admin-Token': token},
                timeout=15,
            )
            if r.status_code == 401 and attempt == 0:
                log.warning('sync/users got 401; force-refreshing JWT')
                token = get_jwt_token(cfg, force=True)
                continue
            r.raise_for_status()
            return r.json()['users']
        except Exception as e:
            if attempt < 2:
                time.sleep(2**attempt)
            else:
                log.error(f'Sync fetch failed after 3 attempts: {e}')
                raise


def get_user_photo(cfg, token, user_id):
    r = httpx.get(
        f"{cfg['server_url']}/api/photos/{user_id}", headers={'X-Admin-Token': token}, timeout=15
    )
    if r.status_code == 401:
        try:
            token = get_jwt_token(cfg, force=True)
        except Exception:
            return None
        r = httpx.get(
            f"{cfg['server_url']}/api/photos/{user_id}",
            headers={'X-Admin-Token': token},
            timeout=15,
        )
    if r.status_code != 200:
        return None
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(r.content))
        if img.width > 480:
            ratio = 480 / img.width
            img = img.resize((480, int(img.height * ratio)), Image.LANCZOS)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return base64.b64encode(r.content).decode()


def hik_auth(t):
    return httpx.DigestAuth(t['user'], t['pass'])


def hik_base(t):
    return f"http://{t['host']}:{t.get('port', 80)}"


def hik_create_user(t, uid, name):
    try:
        emp_no = uid.replace('-', '')[:32]
        payload = {
            'UserInfo': {
                'employeeNo': emp_no,
                'name': name[:32],
                'userType': 'normal',
                'Valid': {
                    'enable': True,
                    'beginTime': '2024-01-01T00:00:00',
                    'endTime': '2030-12-31T23:59:59',
                },
                'doorRight': '1',
                'RightPlan': [{'doorNo': 1, 'planTemplateNo': '1'}],
            }
        }
        r = httpx.post(
            f'{hik_base(t)}/ISAPI/AccessControl/UserInfo/Record?format=json',
            json=payload,
            auth=hik_auth(t),
            timeout=10,
        )
        if r.status_code in (200, 201):
            return True
        if 'AlreadyExist' in r.text or 'alreadyExist' in r.text:
            return True
        r2 = httpx.put(
            f'{hik_base(t)}/ISAPI/AccessControl/UserInfo/Record?format=json',
            json=payload,
            auth=hik_auth(t),
            timeout=10,
        )
        if r2.status_code in (200, 201):
            return True
        if 'AlreadyExist' in r2.text or 'alreadyExist' in r2.text:
            return True
        log.warning(f"[{t['name']}] Create user {name}: {r.status_code} body={r.text[:150]}")
        return False
    except Exception as e:
        log.error(f"[{t['name']}] Create user failed: {e}")
        return False


def hik_upload_face(t, uid, photo_b64):
    try:
        emp_no = uid.replace('-', '')[:32]
        photo_bytes = base64.b64decode(photo_b64)
        auth = hik_auth(t)
        base = hik_base(t)

        fdr_json = json.dumps({'faceLibType': 'blackFD', 'FDID': '1', 'FPID': emp_no})
        files = {
            'FaceDataRecord': (None, fdr_json, 'application/json'),
            'img': ('face.jpg', photo_bytes, 'image/jpeg'),
        }

        r = httpx.post(
            f'{base}/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
            files=files,
            auth=auth,
            timeout=15,
        )
        if r.status_code in (200, 201):
            return True
        if 'deviceUserAlreadyExistFace' in r.text:
            r2 = httpx.put(
                f'{base}/ISAPI/Intelligent/FDLib/FDSetUp?format=json',
                files=files,
                auth=auth,
                timeout=15,
            )
            if r2.status_code in (200, 201):
                return True
            log.warning(
                f"[{t['name']}] Face update via FDSetUp failed: {r2.status_code} body={r2.text[:200]}"
            )
            return False

        log.warning(f"[{t['name']}] Face upload failed: {r.status_code} body={r.text[:200]}")
        return False
    except Exception as e:
        log.error(f"[{t['name']}] Upload face error: {e}")
        return False


def hik_list_face_fpids(t):
    found = set()
    position = 0
    page_size = 100
    base = hik_base(t)
    safety = 50
    try:
        while safety > 0:
            safety -= 1
            data = None
            for attempt in range(4):
                r = httpx.post(
                    f'{base}/ISAPI/Intelligent/FDLib/FDSearch?format=json',
                    json={
                        'searchResultPosition': position,
                        'maxResults': page_size,
                        'faceLibType': 'blackFD',
                        'FDID': '1',
                    },
                    auth=hik_auth(t),
                    timeout=15,
                )
                if r.status_code == 200:
                    data = r.json()
                    break
                if r.status_code == 401:
                    continue
                log.warning(f"[{t['name']}] FDSearch offset {position}: {r.status_code}")
                return None
            if data is None:
                log.warning(f"[{t['name']}] FDSearch gave up at offset {position} after retries")
                return None
            matches = data.get('MatchList', []) or []
            for m in matches:
                fpid = m.get('FPID')
                if fpid:
                    found.add(fpid)
            total = int(data.get('totalMatches', 0))
            position += len(matches)
            if not matches or position >= total:
                break
    except Exception as e:
        log.warning(f"[{t['name']}] FDSearch error: {e}")
        return None
    return found


def hik_delete_user(t, uid):
    try:
        emp_no = uid.replace('-', '')[:32]
        r = httpx.put(
            f'{hik_base(t)}/ISAPI/AccessControl/UserInfo/Delete?format=json',
            json={'UserInfoDelCond': {'EmployeeNoList': [{'employeeNo': emp_no}]}},
            auth=hik_auth(t),
            timeout=10,
        )
        if r.status_code in (200, 201):
            return True
        r2 = httpx.post(
            f'{hik_base(t)}/ISAPI/AccessControl/UserInfo/Delete?format=json',
            json={'UserInfoDelCond': {'EmployeeNoList': [{'employeeNo': emp_no}]}},
            auth=hik_auth(t),
            timeout=10,
        )
        return r2.status_code in (200, 201)
    except Exception as e:
        log.error(f"[{t['name']}] Delete user failed: {e}")
        return False


def hik_test(t):
    try:
        r = httpx.get(
            f'{hik_base(t)}/ISAPI/AccessControl/UserInfo/Count?format=json',
            auth=hik_auth(t),
            timeout=5,
        )
        if r.status_code == 200:
            count = r.json().get('UserInfoCount', {}).get('userNumber', '?')
            log.info(f"[{t['name']}] Connected, {count} users")
            return True
    except Exception as e:
        log.error(f"[{t['name']}] Connection failed: {e}")
    return False


def user_fingerprint(u):
    return f"{u.get('nombre', '')}|{u.get('foto_mtime') or 0}"


_state_file_lock = threading.Lock()


def load_synced():
    with _state_file_lock:
        if not SYNCED_FILE.exists():
            return {}
        try:
            with open(SYNCED_FILE, encoding='utf-8') as f:
                data = json.load(f)
        except (json.JSONDecodeError, ValueError, UnicodeDecodeError, OSError) as e:
            log.error(f'bridge_synced.json unreadable ({e}); backing up + resetting to {{}}')
            try:
                SYNCED_FILE.rename(SYNCED_FILE.with_suffix(f'.broken.{int(time.time())}'))
            except OSError:
                pass
            return {}
    migrated = {}
    for tkey, val in data.items():
        if isinstance(val, list):
            migrated[tkey] = {uid: None for uid in val}
        else:
            migrated[tkey] = val
    return migrated


def save_synced(s, owner='user'):
    with _state_file_lock:
        try:
            with open(SYNCED_FILE, encoding='utf-8') as f:
                disk = json.load(f)
        except (json.JSONDecodeError, ValueError, UnicodeDecodeError, FileNotFoundError, OSError):
            disk = {}
        merged = dict(s)
        if owner == 'user':
            for k, v in disk.items():
                if k.startswith('_events:'):
                    merged[k] = v
        else:
            for k, v in disk.items():
                if not k.startswith('_events:'):
                    merged[k] = v
        # primero se escribe a un tmp y luego se reemplaza asi no queda a medias
        tmp = SYNCED_FILE.with_suffix('.json.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(merged, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, SYNCED_FILE)


def send_heartbeat(cfg, token, status):
    try:
        httpx.post(
            f"{cfg['server_url']}/api/bridge/heartbeat",
            json=status,
            headers={'X-Admin-Token': token},
            timeout=5,
        )
    except Exception as e:
        log.warning(f'Heartbeat send failed: {e}')


_RECENT_EVENTS = []


def add_event(line):
    from datetime import datetime

    stamp = datetime.now().strftime('%H:%M:%S')
    _RECENT_EVENTS.append(f'{stamp} {line}')
    while len(_RECENT_EVENTS) > 30:
        _RECENT_EVENTS.pop(0)


_RECONCILE_EVERY = 20
_cycles_since_reconcile = {}


# t1 aguanta 1500, le dejo 10 de colchon
PRIMARY_TARGET = 1490

_user_terminal_pin: dict[str, str] = {}
_pin_loaded = False


def _load_pins_from_synced(synced):
    global _pin_loaded
    if _pin_loaded:
        return
    for tkey, uids in synced.items():
        if tkey.startswith('_events:'):
            continue
        if isinstance(uids, dict):
            for uid in uids:
                _user_terminal_pin[uid] = tkey
    _pin_loaded = True


def assignment_filter(t, all_users, synced=None):
    a = t.get('assignment')
    if a not in ('primary', 'secondary'):
        if a == 'vip':
            return [u for u in all_users if u.get('status') == 'vip']
        if a == 'guests':
            return [u for u in all_users if u.get('status') not in ('vip', 'banned')]
        return all_users

    if synced is not None:
        _load_pins_from_synced(synced)

    tkey = t['host']
    active = [u for u in all_users if u.get('status') != 'banned']

    # el que ya quedo en una terminal ahi se queda aunque cambie el orden
    pinned_here = []
    new_users = []
    for u in active:
        pin = _user_terminal_pin.get(u['id'])
        if pin == tkey:
            pinned_here.append(u)
        elif pin is None:
            new_users.append(u)

    if a == 'primary':
        new_vips = [u for u in new_users if u.get('status') == 'vip']
        new_non_vips = sorted(
            (u for u in new_users if u.get('status') != 'vip'),
            key=lambda u: u.get('created_at') or '',
        )
        slots = max(0, PRIMARY_TARGET - len(pinned_here) - len(new_vips))
        assigned = pinned_here + new_vips + new_non_vips[:slots]
        for u in new_vips + new_non_vips[:slots]:
            _user_terminal_pin[u['id']] = tkey
        return assigned

    unclaimed = [u for u in new_users if _user_terminal_pin.get(u['id']) is None]
    for u in unclaimed:
        _user_terminal_pin[u['id']] = tkey
    return pinned_here + unclaimed


def sync_cycle(cfg):
    status = {
        'last_sync_ok': False,
        'terminals': {},
        'pending_retries': 0,
        'total_users': 0,
        'error': None,
        'recent_events': [],
    }
    token = None
    try:
        token = get_jwt_token(cfg)
        users = get_server_users(cfg, token)
        server_ids = set(u['id'] for u in users)
        synced = load_synced()
        status['total_users'] = len(users)

        for t in cfg['terminals']:
            tkey = t['host']
            if tkey not in synced:
                synced[tkey] = {}
            reachable = hik_test(t)
            pending_this = 0

            assigned_users = assignment_filter(t, users, synced=synced)
            assigned_ids = set(u['id'] for u in assigned_users)

            do_reconcile = False
            if do_reconcile:
                existing_fpids = hik_list_face_fpids(t)
                if existing_fpids is None:
                    log.warning(
                        f"[{t['name']}] reconcile skipped (FDSearch failed); will retry next cycle"
                    )
                else:
                    _cycles_since_reconcile[tkey] = 0
                    reconciled = 0
                    for u in assigned_users:
                        emp_no = u['id'].replace('-', '')[:32]
                        fp = user_fingerprint(u)
                        if emp_no in existing_fpids and synced[tkey].get(u['id']) != fp:
                            synced[tkey][u['id']] = fp
                            reconciled += 1
                    if reconciled:
                        msg = f"[{t['name']}] Reconciled {reconciled} users already on terminal"
                        log.info(msg)
                        add_event(msg)
                        save_synced(synced)
            else:
                _cycles_since_reconcile[tkey] = _cycles_since_reconcile.get(tkey, 0) + 1

            deleted = [uid for uid in synced[tkey] if uid not in server_ids]
            if deleted:
                # si son mas de 600 de golpe mejor no borra nada
                if len(deleted) > 600:
                    log.warning(
                        f"[{t['name']}] {len(deleted)} users marked for delete: too many, skipping (possible truncated server response)"
                    )
                else:
                    msg = f"[{t['name']}] {len(deleted)} users to delete (banned/removed)"
                    log.info(msg)
                    add_event(msg)
                    for uid in deleted:
                        if hik_delete_user(t, uid):
                            log.info(f"[{t['name']}] Deleted: {uid[:8]}...")
                            synced[tkey].pop(uid, None)
                            _user_terminal_pin.pop(uid, None)
                        else:
                            log.warning(f"[{t['name']}] Delete failed, will retry: {uid[:8]}...")
                            pending_this += 1
                    save_synced(synced)

            log.info(
                f"[{t['name']}] DEBUG: synced={len(synced[tkey])}, assigned={len(assigned_users)}, server_ids={len(server_ids)}"
            )
            pending = [
                u for u in assigned_users if synced[tkey].get(u['id']) != user_fingerprint(u)
            ]
            if pending:
                msg = f"[{t['name']}] {len(pending)} users to sync"
                log.info(msg)
                add_event(msg)
                for i, u in enumerate(pending):
                    if not hik_create_user(t, u['id'], u['id'][:8]):
                        pending_this += 1
                        continue
                    photo = get_user_photo(cfg, token, u['id'])
                    if photo and hik_upload_face(t, u['id'], photo):
                        synced[tkey][u['id']] = user_fingerprint(u)
                        save_synced(synced)
                        msg = f"[{t['name']}] Synced: {u['nombre']}"
                        log.info(msg)
                        add_event(msg)
                    else:
                        msg = f"[{t['name']}] Failed (will retry): {u['nombre']}"
                        log.warning(msg)
                        add_event(msg)
                        pending_this += 1
                    if (i + 1) % 25 == 0:
                        progress_status = {
                            **status,
                            'terminals': {
                                **status['terminals'],
                                tkey: {
                                    'name': t['name'],
                                    'reachable': reachable,
                                    'pending': len(pending) - i - 1 + pending_this,
                                    'synced_count': len(synced[tkey]),
                                },
                            },
                            'recent_events': list(_RECENT_EVENTS),
                        }
                        send_heartbeat(cfg, token, progress_status)

            save_synced(synced)
            status['terminals'][tkey] = {
                'name': t['name'],
                'reachable': reachable,
                'pending': pending_this,
                'synced_count': len(synced[tkey]),
            }
            status['pending_retries'] += pending_this

            status['recent_events'] = list(_RECENT_EVENTS)
            send_heartbeat(cfg, token, status)

        status['last_sync_ok'] = True
    except Exception as e:
        log.error(f'Sync error: {e}')
        status['error'] = str(e)
        add_event(f'ERROR: {e}')

    if token:
        status['recent_events'] = list(_RECENT_EVENTS)
        send_heartbeat(cfg, token, status)


EVENT_INTERVAL = 10
EVENT_PAGE = 200
EVENT_BACKFILL_HOURS = 168
EVENT_LOOKBACK_MIN = 30
INTERESTING_MINORS = {75, 76}


def _event_cursor_key(t):
    return f"_events:{t['host']}"


def load_event_cursor(synced, t):
    key = _event_cursor_key(t)
    raw = synced.get(key) or {}
    return int(raw.get('last_serial', 0) or 0), raw.get('last_time_iso')


def save_event_cursor(synced, t, last_serial, last_time_iso):
    synced[_event_cursor_key(t)] = {'last_serial': int(last_serial), 'last_time_iso': last_time_iso}


def _now_local_iso(t_offset_hours=-6):
    return datetime.now(timezone(timedelta(hours=t_offset_hours))).strftime(
        '%Y-%m-%dT%H:%M:%S-06:00'
    )


def _backfill_start_iso():
    return (
        datetime.now(timezone(timedelta(hours=-6))) - timedelta(hours=EVENT_BACKFILL_HOURS)
    ).strftime('%Y-%m-%dT%H:%M:%S-06:00')


def hik_fetch_event_page(t, start_iso, end_iso, position):
    body = {
        'AcsEventCond': {
            'searchID': _uuid.uuid4().hex,
            'searchResultPosition': position,
            'maxResults': EVENT_PAGE,
            'major': 0,
            'minor': 0,
            'startTime': start_iso,
            'endTime': end_iso,
        }
    }
    for attempt in range(4):
        with httpx.Client(timeout=20.0, auth=hik_auth(t)) as c:
            r = c.post(f'{hik_base(t)}/ISAPI/AccessControl/AcsEvent?format=json', json=body)
        if r.status_code == 200:
            try:
                payload = r.json().get('AcsEvent', {}) or {}
                return (
                    payload.get('InfoList') or [],
                    int(payload.get('totalMatches', 0) or 0),
                    payload.get('responseStatusStrg', 'OK'),
                )
            except Exception as e:
                log.warning(f"[{t['name']}] AcsEvent decode error: {e}")
                return [], 0, 'DECODE_ERROR'
        if r.status_code == 401:
            continue
        log.warning(f"[{t['name']}] AcsEvent HTTP {r.status_code}: {r.text[:200]}")
        return [], 0, f'HTTP_{r.status_code}'
    log.warning(f"[{t['name']}] AcsEvent gave up after 4 retries at offset {position}")
    return [], 0, 'RETRY_EXHAUSTED'


def post_terminal_events(cfg, token, batch):
    if not batch:
        return None
    try:
        r = httpx.post(
            f"{cfg['server_url']}/api/terminal-events",
            json={'events': batch},
            headers={'X-Admin-Token': token},
            timeout=30,
        )
        if r.status_code == 200:
            return r.json()
        log.warning(f'terminal-events POST {r.status_code}: {r.text[:200]}')
    except Exception as e:
        log.warning(f'terminal-events POST failed: {e}')
    return None


def collect_terminal_events(t, last_serial, last_time_iso):
    end_iso = _now_local_iso()
    start_iso = last_time_iso or _backfill_start_iso()

    new_events = []
    new_max_serial = last_serial
    new_max_time_iso = last_time_iso

    position = 0
    safety = 50
    while safety > 0:
        safety -= 1
        info_list, total, status = hik_fetch_event_page(t, start_iso, end_iso, position)
        if not info_list:
            break
        for ev in info_list:
            serial = ev.get('serialNo')
            minor = ev.get('minor')
            ev_time = ev.get('time')
            if serial is None or minor is None or ev_time is None:
                continue
            if minor not in INTERESTING_MINORS:
                if isinstance(serial, int) and serial > new_max_serial:
                    new_max_serial = serial
                if not new_max_time_iso or ev_time > new_max_time_iso:
                    new_max_time_iso = ev_time
                continue
            if isinstance(serial, int) and serial <= last_serial:
                continue

            new_events.append(
                {
                    'terminal_ip': t['host'],
                    'event_serial': int(serial),
                    'event_minor': int(minor),
                    'event_time': ev_time,
                    'employee_no': ev.get('employeeNoString') or None,
                    'name': ev.get('name') or None,
                }
            )
            if isinstance(serial, int) and serial > new_max_serial:
                new_max_serial = serial
            if not new_max_time_iso or ev_time > new_max_time_iso:
                new_max_time_iso = ev_time

        position += len(info_list)
        if status != 'MORE' or position >= total:
            break

    return new_events, new_max_serial, new_max_time_iso


def event_cycle(cfg):
    try:
        token = get_jwt_token(cfg)
    except Exception as e:
        log.warning(f'[events] login failed: {e}')
        return

    synced = load_synced()

    for t in cfg['terminals']:
        last_serial, last_time_iso = load_event_cursor(synced, t)
        events, new_serial, new_time = collect_terminal_events(t, last_serial, last_time_iso)
        all_chunks_ok = True
        if events:
            sent = 0
            for i in range(0, len(events), 100):
                chunk = events[i : i + 100]
                resp = post_terminal_events(cfg, token, chunk)
                if resp is None:
                    all_chunks_ok = False
                    break
                sent += resp.get('saved', 0)
            msg = f"[{t['name']}] events: pulled {len(events)} new, server saved {sent}"
            log.info(msg)
            add_event(msg)
        if all_chunks_ok:
            save_event_cursor(synced, t, new_serial, new_time)

    save_synced(synced, owner='events')


def event_loop(cfg):
    log.info(f'Event polling loop started (every {EVENT_INTERVAL}s)')
    while True:
        try:
            event_cycle(cfg)
        except Exception as e:
            log.error(f'event_cycle crashed: {e}')
            add_event(f'event_cycle ERROR: {e}')
        time.sleep(EVENT_INTERVAL)


def main():
    if not CONFIG_PATH.exists():
        log.error(f'Config not found: {CONFIG_PATH}')
        sys.exit(1)

    cfg = load_config()
    terminals = cfg.get('terminals', [])
    log.info(f'MUTE Hikvision Bridge: {len(terminals)} terminals')

    for t in terminals:
        log.info(f"  {t['name']} @ {t['host']}")
        hik_test(t)

    log.info('Initial sync...')
    sync_cycle(cfg)

    # los eventos van en otro hilo pa que no se atoren con el sync
    event_thread = threading.Thread(target=event_loop, args=(cfg,), daemon=True)
    event_thread.start()

    interval = cfg.get('sync_interval', 30)
    log.info(f'Syncing users every {interval}s')

    while True:
        time.sleep(interval)
        sync_cycle(cfg)


if __name__ == '__main__':
    main()
