import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  loadModels,
  detectBoxes,
  detectAndIdentify,
  descriptorFromBase64,
  buildDescriptorMatrix,
  matchAllFaces,
  FACE_TOLERANCE,
} from '../services/faceLocal';
import { saveUsers as saveUsersDB, loadUsers as loadUsersDB } from '../services/localDB';

const FILTERS = [
  { id: 'none', label: 'Sin filtro' },
  { id: 'bw', label: 'B&W' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'glass', label: 'Glass' },
  { id: 'vision', label: 'Vision' },
];

const SYNC_INTERVAL = 30000;
// el rapido nomas saca los cuadros el lento es el que reconoce
const FAST_INTERVAL = 150;
const FULL_INTERVAL = 1500;

function KioskCamera({ videoRef }) {
  const [error, setError] = useState(null);
  const streamRef = useRef(null);
  const retryRef = useRef(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            console.warn('[CAM] Track ended, reconnecting in 3s...');
            retryRef.current = setTimeout(startCamera, 3000);
          };
        });
      }
    } catch {
      setError('Camara no disponible, reintentando...');
      retryRef.current = setTimeout(startCamera, 5000);
    }
  }, [videoRef]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [startCamera]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ transform: 'scaleX(-1)' }}
        className="w-full h-full object-cover"
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-mute-amber text-xs uppercase tracking-wider animate-pulse">
            {error}
          </p>
        </div>
      )}
    </>
  );
}

function FaceOverlay({ face, filter }) {
  const box = face.box;
  const matched = face.match;
  const status = matched ? face.user.status : null;
  const denied = status === 'banned';
  const color = !matched
    ? 'rgba(255,255,255,0.3)'
    : denied
      ? 'rgba(239,68,68,0.9)'
      : status === 'vip'
        ? 'rgba(255,165,0,0.9)'
        : 'rgba(74,222,128,0.9)';

  const style = {
    top: `${box.top * 100}%`,
    left: `${(1 - box.right) * 100}%`,
    width: `${(box.right - box.left) * 100}%`,
    height: `${(box.bottom - box.top) * 100}%`,
    transition:
      'top 0.3s ease-out, left 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out',
    willChange: 'top, left, width, height',
  };

  return (
    <div className="absolute pointer-events-none z-10" style={style}>
      <div
        className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2"
        style={{ borderColor: color }}
      />
      <div
        className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2"
        style={{ borderColor: color }}
      />
      <div
        className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2"
        style={{ borderColor: color }}
      />
      <div
        className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2"
        style={{ borderColor: color }}
      />
      {matched && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span
            className="text-sm font-black drop-shadow-lg tracking-wide"
            style={{ color }}
          >
            {face.user.nombre.toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: color }}
        />
        <span
          className="text-[10px] font-mono font-bold tracking-wider drop-shadow-lg"
          style={{ color }}
        >
          {!matched
            ? 'NO REGISTRADO'
            : denied
              ? 'DENEGADO'
              : status === 'vip'
                ? 'VIP'
                : 'BIENVENIDO'}
        </span>
      </div>
      {filter === 'vision' && matched && (
        <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <p className="text-[9px] font-mono text-white/30 text-center">
            CONF: {((1 - face.distance) * 100).toFixed(1)}% | DIST:{' '}
            {face.distance.toFixed(4)}
          </p>
        </div>
      )}
    </div>
  );
}

function VisionHUD({ userCount, lastSync }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
        }}
      />
      <div className="absolute top-3 left-3 text-[9px] font-mono text-white/30 space-y-0.5">
        <p>MUTE.SYS v2.1.0 [LOCAL]</p>
        <p>FACE_API.JS // BROWSER</p>
        <p>
          {time.toLocaleTimeString('en-US', { hour12: false })}.
          {String(time.getMilliseconds()).padStart(3, '0')}
        </p>
      </div>
      <div className="absolute top-3 right-3 text-[9px] font-mono text-white/20 text-right space-y-0.5">
        <p>DB: {userCount} usuarios</p>
        <p>
          SYNC: {lastSync ? `${Math.round((Date.now() - lastSync) / 1000)}s ago` : '...'}
        </p>
        <p>DETECT: LOCAL / MULTI</p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-6 bg-black/40 flex items-center px-3 gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[8px] font-mono text-white/30 uppercase tracking-wider">
          100% Offline
        </span>
        <span className="text-[8px] font-mono text-white/20 ml-auto">
          MUTE ACCESS CONTROL
        </span>
      </div>
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />
    </div>
  );
}

function LoadingScreen({ status, error, onRetry, onReset }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center animate-fade-in">
        <h1 className="text-3xl font-black text-mute-amber mute-glow-sm mb-4">MUTE.</h1>
        {!error && (
          <>
            <div className="w-8 h-8 border-2 border-mute-amber/30 border-t-mute-amber rounded-full animate-spin mx-auto mb-4" />
            <p className="text-mute-amber text-xs animate-pulse">
              {status || 'Iniciando...'}
            </p>
          </>
        )}
        {error && (
          <>
            <p className="text-red-400 text-sm mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={onRetry} className="btn-mute py-2 px-6 text-xs">
                Reintentar
              </button>
              <button onClick={onReset} className="btn-mute-outline py-2 px-6 text-xs">
                Reconfigurar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SetupScreen({ onConnect }) {
  const [serverUrl, setServerUrl] = useState(
    localStorage.getItem('mute_kiosk_server') || '',
  );
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const base = serverUrl.replace(/\/$/, '');
      const result = await doFullSync(base, password, [], setStatus);
      localStorage.setItem('mute_kiosk_server', base);
      localStorage.setItem('mute_kiosk_token', result.token);
      localStorage.setItem('mute_kiosk_password', password);
      onConnect(base, result.token, result.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-mute-amber mute-glow-sm">MUTE.</h1>
          <p className="text-mute-muted text-[10px] uppercase tracking-[0.3em] mt-1">
            Kiosk - Configuracion
          </p>
        </div>
        <form onSubmit={handleConnect} className="space-y-5">
          <div>
            <label className="block text-[11px] text-mute-muted mb-2 uppercase tracking-[0.2em]">
              URL del servidor
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="input-mute"
              placeholder="https://mute.tudominio.com"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] text-mute-muted mb-2 uppercase tracking-[0.2em]">
              Contraseña admin
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-mute"
              placeholder="Contraseña"
              required
            />
          </div>
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          {status && (
            <p className="text-mute-amber text-xs text-center animate-pulse">{status}</p>
          )}
          <button
            type="submit"
            className="btn-mute w-full py-3 text-sm"
            disabled={loading}
          >
            {loading ? 'Preparando...' : 'Conectar'}
          </button>
        </form>
      </div>
    </div>
  );
}

async function doFullSync(serverUrl, passwordOrToken, existingUsers, setStatus) {
  setStatus('Cargando modelos de IA...');
  await loadModels();

  let token = passwordOrToken;
  setStatus('Conectando al servidor...');

  let res = await fetch(`${serverUrl}/api/sync/users`, {
    headers: { 'X-Admin-Token': token },
  });

  if (res.status === 401) {
    setStatus('Autenticando...');
    const loginRes = await fetch(`${serverUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordOrToken }),
    });
    if (!loginRes.ok)
      throw new Error('Sesion expirada. Ingresa la contraseña nuevamente.');
    const loginData = await loginRes.json();
    token = loginData.token;

    res = await fetch(`${serverUrl}/api/sync/users`, {
      headers: { 'X-Admin-Token': token },
    });
    if (!res.ok) throw new Error('Error sincronizando');
  }

  if (!res.ok) throw new Error('Error conectando al servidor');
  const data = await res.json();

  setStatus(`Procesando ${data.total} rostros...`);

  const usersWithDescriptors = [];
  for (let i = 0; i < data.users.length; i++) {
    const u = data.users[i];
    const existing = existingUsers.find((e) => e.id === u.id);
    if (existing && existing.localDescriptor) {
      usersWithDescriptors.push({ ...u, localDescriptor: existing.localDescriptor });
      continue;
    }

    setStatus(`Procesando rostro ${i + 1}/${data.total}: ${u.nombre}`);
    if (u.foto_base64) {
      const descriptor = await descriptorFromBase64(u.foto_base64);
      usersWithDescriptors.push({ ...u, localDescriptor: descriptor || null });
    } else {
      usersWithDescriptors.push({ ...u, localDescriptor: null });
    }
  }

  try {
    await saveUsersDB(usersWithDescriptors);
  } catch {}

  return { token, users: usersWithDescriptors };
}

export default function Kiosk() {
  const [phase, setPhase] = useState('checking');
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [localUsers, setLocalUsers] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [syncError, setSyncError] = useState(false);
  const [loadStatus, setLoadStatus] = useState('');
  const [loadError, setLoadError] = useState(null);

  const [faces, setFaces] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [lastTime, setLastTime] = useState(null);
  const [filter, setFilter] = useState('none');
  const [showFilters, setShowFilters] = useState(false);

  const videoRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('reset')) {
      localStorage.removeItem('mute_kiosk_server');
      localStorage.removeItem('mute_kiosk_token');
      localStorage.removeItem('mute_kiosk_password');
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload();
      return;
    }
    const overridePwd = params.get('password');
    if (overridePwd) {
      localStorage.setItem('mute_kiosk_password', overridePwd);
      localStorage.removeItem('mute_kiosk_token');
      const overrideServer = params.get('server');
      if (overrideServer) {
        localStorage.setItem('mute_kiosk_server', overrideServer);
      }
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload();
      return;
    }

    const savedServer = localStorage.getItem('mute_kiosk_server');
    const savedToken = localStorage.getItem('mute_kiosk_token');
    const savedPassword = localStorage.getItem('mute_kiosk_password');

    if (savedServer && !savedToken && savedPassword) {
      setPhase('loading');
      setServerUrl(savedServer);
      setLoadStatus('Autenticando con nueva contraseña...');
      fetch(`${savedServer}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: savedPassword }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Contraseña inválida'))))
        .then(({ token: freshToken }) => {
          localStorage.setItem('mute_kiosk_token', freshToken);
          window.location.reload();
        })
        .catch((err) => {
          setLoadError(err.message);
        });
      return;
    }

    if (savedServer && savedToken) {
      setPhase('loading');
      setServerUrl(savedServer);
      setToken(savedToken);

      loadUsersDB()
        .then(async (cachedUsers) => {
          if (cachedUsers.length > 0 && cachedUsers[0].localDescriptor) {
            setLoadStatus(`${cachedUsers.length} rostros cargados de cache local`);
            setLocalUsers(cachedUsers);
            setLastSync(Date.now());
            setPhase('ready');
            try {
              await loadModels();
            } catch {}
            doFullSync(savedServer, savedToken, cachedUsers, () => {})
              .then((result) => {
                setToken(result.token);
                setLocalUsers(result.users);
              })
              .catch(() => {});
            return;
          }
          return doFullSync(savedServer, savedToken, [], setLoadStatus);
        })
        .then((result) => {
          if (result) {
            setToken(result.token);
            setLocalUsers(result.users);
            setLastSync(Date.now());
            setPhase('ready');
          }
        })
        .catch((err) => {
          setLoadError(err.message);
          setPhase('loading');
        });
    } else {
      setPhase('setup');
    }
  }, []);

  const localUsersRef = useRef(localUsers);
  useEffect(() => {
    localUsersRef.current = localUsers;
  }, [localUsers]);

  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const refreshToken = useCallback(async () => {
    const pwd = localStorage.getItem('mute_kiosk_password');
    if (!pwd) return null;
    try {
      const r = await fetch(`${serverUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      if (r.ok) {
        const { token: newToken } = await r.json();
        setToken(newToken);
        tokenRef.current = newToken;
        localStorage.setItem('mute_kiosk_token', newToken);
        klog('TOKEN: refreshed');
        return newToken;
      }
    } catch {}
    return null;
  }, [serverUrl]);

  const syncFromServer = useCallback(async () => {
    if (!serverUrl || !tokenRef.current) return;
    try {
      let currentToken = tokenRef.current;
      const syncHeaders = { 'X-Admin-Token': currentToken };
      if (syncEtagRef.current) syncHeaders['If-None-Match'] = syncEtagRef.current;
      let res = await fetch(`${serverUrl}/api/sync/users?photos=false`, {
        headers: syncHeaders,
      });

      if (res.status === 401) {
        klog('SYNC: token expired, refreshing...');
        currentToken = await refreshToken();
        if (!currentToken) {
          setSyncError(true);
          return;
        }
        res = await fetch(`${serverUrl}/api/sync/users?photos=false`, {
          headers: {
            'X-Admin-Token': currentToken,
            ...(syncEtagRef.current ? { 'If-None-Match': syncEtagRef.current } : {}),
          },
        });
      }

      if (res.status === 304) {
        setLastSync(Date.now());
        setSyncError(false);
        syncIntervalRef.current = SYNC_INTERVAL;
        return;
      }

      if (!res.ok) {
        setSyncError(true);
        return;
      }
      syncEtagRef.current = res.headers.get('etag');
      const data = await res.json();

      const currentUsers = localUsersRef.current;
      const localIds = new Set(currentUsers.map((u) => u.id));
      const serverIds = new Set(data.users.map((u) => u.id));
      const newServerUsers = data.users.filter((u) => !localIds.has(u.id));

      const dropped = currentUsers.filter((u) => !serverIds.has(u.id));
      if (dropped.length > 0) {
        const trimmed = currentUsers.filter((u) => serverIds.has(u.id));
        setLocalUsers(trimmed);
        try {
          await saveUsersDB(trimmed);
        } catch {}
        klog(`SYNC: dropped ${dropped.length} expired/removed users`);
      }

      if (newServerUsers.length > 0) {
        klog(`SYNC: found ${newServerUsers.length} new users, fetching photos...`);
        const newUsers = [];
        const chunks = [];
        for (let i = 0; i < newServerUsers.length; i += 5) {
          chunks.push(newServerUsers.slice(i, i + 5));
        }
        for (const chunk of chunks) {
          const results = await Promise.all(
            chunk.map(async (u) => {
              try {
                const imgRes = await fetch(
                  `${serverUrl}/api/photos/${u.id}?token=${currentToken}`,
                  {
                    signal: AbortSignal.timeout(15000),
                  },
                );
                if (imgRes.ok) {
                  const blob = await imgRes.blob();
                  const b64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                  });
                  const descriptor = await descriptorFromBase64(b64);
                  return { ...u, localDescriptor: descriptor };
                }
              } catch {}
              return { ...u, localDescriptor: null };
            }),
          );
          newUsers.push(...results);
        }

        const updated = [...localUsersRef.current, ...newUsers];
        setLocalUsers(updated);
        try {
          await saveUsersDB(updated);
        } catch (e) {
          klog(`DB_SAVE_ERROR: ${e.message}`);
        }
        klog(`SYNC: +${newUsers.length} new users added`);
      }

      setLastSync(Date.now());
      setSyncError(false);
      syncIntervalRef.current = SYNC_INTERVAL;
    } catch (e) {
      klog(`SYNC_ERROR: ${e.message}`);
      setSyncError(true);
      syncIntervalRef.current = Math.min(syncIntervalRef.current * 2, 300000);
      klog(`BACKOFF: next sync in ${syncIntervalRef.current / 1000}s`);
    }
  }, [serverUrl, refreshToken]);

  useEffect(() => {
    if (phase !== 'ready') return;
    let timer = null;
    const scheduleSync = () => {
      timer = setTimeout(async () => {
        await syncFromServer();
        scheduleSync();
      }, syncIntervalRef.current);
    };
    scheduleSync();

    const handleOnline = () => {
      console.log('[KIOSK] Internet recovered, syncing...');
      syncIntervalRef.current = SYNC_INTERVAL;
      setSyncError(false);
      syncFromServer();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
    };
  }, [phase, syncFromServer]);

  const handleConnect = useCallback((base, tok, users) => {
    setServerUrl(base);
    setToken(tok);
    setLocalUsers(users);
    setLastSync(Date.now());
    setPhase('ready');
  }, []);

  const descriptorMatrix = useMemo(() => {
    const descs = localUsers
      .filter((u) => u.localDescriptor)
      .map((u) => u.localDescriptor);
    return buildDescriptorMatrix(descs);
  }, [localUsers]);

  const syncIntervalRef = useRef(SYNC_INTERVAL);
  const syncEtagRef = useRef(null);
  const kioskLogs = useRef([]);
  const klog = (msg) => {
    const ts = new Date().toISOString().slice(11, 23);
    kioskLogs.current.push(`${ts} ${msg}`);
    if (kioskLogs.current.length > 200) kioskLogs.current.shift();
  };

  const accessLogQueue = useRef([]);

  useEffect(() => {
    if (!serverUrl || !token) return;
    const id = setInterval(async () => {
      if (kioskLogs.current.length > 0) {
        const batch = [...kioskLogs.current];
        kioskLogs.current = [];
        try {
          await fetch(`${serverUrl}/api/kiosk-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs: batch }),
          });
        } catch {}
      }
      if (accessLogQueue.current.length > 0) {
        const logs = [...accessLogQueue.current];
        accessLogQueue.current = [];
        try {
          await fetch(`${serverUrl}/api/access-log`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': tokenRef.current,
            },
            body: JSON.stringify({ logs }),
          });
        } catch {}
      }
    }, 30000);
    return () => clearInterval(id);
  }, [serverUrl, token]);

  const identifiedRef = useRef([]);
  const fastBusy = useRef(false);
  const fullBusy = useRef(false);
  const missCount = useRef(0);
  const faceIdCounter = useRef(0);

  const fastScan = useCallback(async () => {
    if (fastBusy.current || !videoRef.current || videoRef.current.readyState < 2) return;
    fastBusy.current = true;
    const t0 = performance.now();
    try {
      const boxes = await detectBoxes(videoRef.current);
      if (boxes.length === 0) {
        missCount.current++;
        if (missCount.current > 6) {
          setFaces([]);
          identifiedRef.current = [];
        }
        fastBusy.current = false;
        return;
      }
      missCount.current = 0;

      const stillPresent = identifiedRef.current.filter((prev) => {
        const px = (prev.box.left + prev.box.right) / 2;
        const py = (prev.box.top + prev.box.bottom) / 2;
        return boxes.some((b) => {
          const cx = (b.box.left + b.box.right) / 2;
          const cy = (b.box.top + b.box.bottom) / 2;
          return Math.abs(cx - px) + Math.abs(cy - py) < 0.25;
        });
      });
      identifiedRef.current = stillPresent;

      const claimed = new Set();
      const merged = boxes.map((b) => {
        const cx = (b.box.left + b.box.right) / 2;
        const cy = (b.box.top + b.box.bottom) / 2;
        let best = null,
          bestD = 0.2;
        for (let pi = 0; pi < stillPresent.length; pi++) {
          if (claimed.has(pi)) continue;
          const prev = stillPresent[pi];
          if (!prev.match) continue;
          const px = (prev.box.left + prev.box.right) / 2;
          const py = (prev.box.top + prev.box.bottom) / 2;
          const d = Math.abs(cx - px) + Math.abs(cy - py);
          if (d < bestD) {
            bestD = d;
            best = { prev, idx: pi };
          }
        }
        if (best) {
          claimed.add(best.idx);
          return { ...best.prev, box: b.box };
        }
        faceIdCounter.current++;
        return { box: b.box, match: false, _id: `tmp-${faceIdCounter.current}` };
      });
      setFaces(merged);
      const elapsed = Math.round(performance.now() - t0);
      setLastTime(elapsed);
      if (faceIdCounter.current % 10 === 0) {
        const named = merged.filter((m) => m.match).map((m) => m.user.nombre);
        klog(
          `FAST: ${boxes.length} boxes, ${named.length} named [${named.join(', ')}] ${elapsed}ms`,
        );
      }
    } catch {
    } finally {
      fastBusy.current = false;
    }
  }, []);

  const fullScan = useCallback(async () => {
    if (fullBusy.current || !videoRef.current || videoRef.current.readyState < 2) return;
    fullBusy.current = true;
    const t0 = performance.now();
    try {
      const detected = await detectAndIdentify(videoRef.current);
      const results = matchAllFaces(
        detected,
        localUsers,
        descriptorMatrix,
        FACE_TOLERANCE,
      );
      const elapsed = Math.round(performance.now() - t0);
      const matched = results.filter((r) => r.match).map((r) => r.user.nombre);
      const dbSize = localUsers.filter((u) => u.localDescriptor).length;
      const msg = `FULL: ${detected.length} faces, ${matched.length} matched [${matched.join(', ')}] ${elapsed}ms | DB: ${dbSize} users`;
      console.log(`[ID] ${msg}`);
      klog(msg);
      identifiedRef.current = results;
      if (results.length > 0) setFaces(results);
      else if (detected.length === 0) {
        setFaces([]);
        identifiedRef.current = [];
      }
    } catch (e) {
      console.warn('[ID error]', e);
    } finally {
      fullBusy.current = false;
    }
  }, [localUsers, descriptorMatrix]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const fastId = setInterval(fastScan, FAST_INTERVAL);
    const fullId = setInterval(fullScan, FULL_INTERVAL);
    fullScan();
    return () => {
      clearInterval(fastId);
      clearInterval(fullId);
    };
  }, [phase, fastScan, fullScan]);

  const glowColor = useMemo(() => {
    if (faces.length === 0) return 'transparent';
    const hasBanned = faces.some((f) => f.match && f.user?.status === 'banned');
    const hasVip = faces.some((f) => f.match && f.user?.status === 'vip');
    const hasMatch = faces.some((f) => f.match);
    if (hasBanned) return 'rgba(239, 68, 68, 0.5)';
    if (hasVip) return 'rgba(255, 165, 0, 0.6)';
    if (hasMatch) return 'rgba(74, 222, 128, 0.45)';
    return 'rgba(255, 255, 255, 0.15)';
  }, [faces]);

  const glowOuter = useMemo(() => {
    if (faces.length === 0) return 'transparent';
    const hasBanned = faces.some((f) => f.match && f.user?.status === 'banned');
    const hasVip = faces.some((f) => f.match && f.user?.status === 'vip');
    const hasMatch = faces.some((f) => f.match);
    if (hasBanned) return 'rgba(239, 68, 68, 0.15)';
    if (hasVip) return 'rgba(255, 165, 0, 0.2)';
    if (hasMatch) return 'rgba(74, 222, 128, 0.12)';
    return 'transparent';
  }, [faces]);

  if (phase === 'checking') return null;

  if (phase === 'setup') return <SetupScreen onConnect={handleConnect} />;

  if (phase === 'loading' && loadError) {
    return (
      <LoadingScreen
        status={loadStatus}
        error={loadError}
        onRetry={() => {
          setLoadError(null);
          setPhase('checking');
          const savedServer = localStorage.getItem('mute_kiosk_server');
          const savedToken = localStorage.getItem('mute_kiosk_token');
          if (savedServer && savedToken) {
            setPhase('loading');
            doFullSync(savedServer, savedToken, [], setLoadStatus)
              .then((result) => {
                setToken(result.token);
                setLocalUsers(result.users);
                setLastSync(Date.now());
                setPhase('ready');
              })
              .catch((err) => {
                setLoadError(err.message);
              });
          } else {
            setPhase('setup');
          }
        }}
        onReset={() => {
          localStorage.removeItem('mute_kiosk_server');
          localStorage.removeItem('mute_kiosk_token');
          setPhase('setup');
        }}
      />
    );
  }

  if (phase === 'loading') {
    return <LoadingScreen status={loadStatus} />;
  }

  const videoFilterClass = {
    none: '',
    bw: 'grayscale',
    glitch: 'glitch-filter',
    glass: 'glass-filter',
    vision: 'vision-filter',
  }[filter];

  const statusColors = {
    registered: {
      text: 'text-green-400',
      bg: 'bg-green-400/10',
      border: 'border-green-400/30',
      label: 'BIENVENIDO',
    },
    vip: {
      text: 'text-mute-amber',
      bg: 'bg-mute-amber/10',
      border: 'border-mute-amber/30',
      label: 'VIP',
    },
    banned: {
      text: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      label: 'DENEGADO',
    },
  };

  return (
    <div className="h-screen w-screen bg-mute-black flex flex-col overflow-hidden select-none cursor-none relative">
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-300"
        style={{
          background: `radial-gradient(ellipse at center, ${glowOuter}, transparent 70%)`,
        }}
      />

      <div className="relative z-20 flex items-center justify-between px-8 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-1.5 h-1.5 rounded-full ${syncError ? 'bg-red-400' : 'bg-green-400'}`}
          />
          <span className="text-white/15 text-[9px] font-mono">
            {localUsers.filter((u) => u.localDescriptor).length} rostros
          </span>
        </div>
        <div className="flex items-center gap-4">
          {lastTime && (
            <span className="text-white/15 text-[10px] font-mono">{lastTime}ms</span>
          )}
          {processing && (
            <div className="w-2 h-2 rounded-full bg-mute-amber animate-pulse" />
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-white/20 hover:text-mute-amber text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
          >
            Filtros
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="absolute top-14 right-8 z-30 bg-black/80 backdrop-blur-md rounded-sm border border-white/10 p-2 flex flex-col gap-1 animate-fade-in">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id);
                setShowFilters(false);
              }}
              className={`px-4 py-2 rounded-sm text-[11px] uppercase tracking-wider text-left transition-all cursor-pointer ${
                filter === f.id
                  ? 'bg-mute-amber text-black font-bold'
                  : 'text-white/60 hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-[8vw] pb-2 relative z-10">
        <div className="relative w-full max-w-[72vw] aspect-video">
          <div
            className="absolute -inset-2 rounded-2xl transition-colors duration-700"
            style={{ background: glowColor, opacity: 0.5 }}
          />
          <div
            className="absolute -inset-1 rounded-xl transition-colors duration-200"
            style={{ boxShadow: `0 0 20px ${glowColor}` }}
          />

          <div
            className={`relative w-full h-full rounded-xl overflow-hidden border border-white/10 ${videoFilterClass}`}
            style={{ transform: 'translateZ(0)' }}
          >
            <KioskCamera videoRef={videoRef} />
            <div className="absolute top-3 left-4 z-10 pointer-events-none">
              <span className="text-white/15 text-[7rem] font-black tracking-tight">
                MUTE.
              </span>
            </div>
            {faces.map((face, i) => {
              const key = face.match ? face.user.id : face._id || `u-${i}`;
              return <FaceOverlay key={key} face={face} filter={filter} />;
            })}
            {filter === 'vision' && (
              <VisionHUD
                userCount={localUsers.filter((u) => u.localDescriptor).length}
                lastSync={lastSync}
              />
            )}
            {filter === 'glitch' && (
              <div className="absolute inset-0 pointer-events-none glitch-overlay" />
            )}
          </div>
        </div>
      </div>

      <div className="relative z-20 flex-shrink-0 py-3 px-6">
        {faces.length > 0 ? (
          <div className="flex gap-3 flex-wrap justify-center">
            {faces.map((face, i) => {
              const key = face.match ? `r-${face.user.id}` : `r-${face._id || i}`;
              if (face.match) {
                const cfg = statusColors[face.user.status];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full ${cfg.bg} border ${cfg.border}`}
                  >
                    <span className="text-white font-bold text-sm">
                      {face.user.nombre.toUpperCase()}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider ${cfg.text}`}
                    >
                      {cfg.label}
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10"
                >
                  <span className="text-white/30 text-sm">Desconocido</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[9px] text-white/10 uppercase tracking-[0.25em] font-mono text-center">
            Esperando rostros
          </p>
        )}
      </div>
    </div>
  );
}
