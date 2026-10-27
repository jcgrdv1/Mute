import { useState, useEffect, useRef } from 'react';

const API = '/api';

export default function Monitor() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [data, setData] = useState(null);
  const pollRef = useRef(null);

  const login = async (e) => {
    e.preventDefault();
    try {
      const r = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setToken(d.token);
      setAuthed(true);
    } catch {
      setError('Contraseña incorrecta');
    }
  };

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const [health, users, kioskStatus, bridgeStatus] = await Promise.all([
        fetch(`${API}/../health`)
          .then((r) => r.json())
          .catch(() => ({ status: 'error' })),
        fetch(`${API}/sync/users?photos=false`, { headers: { 'X-Admin-Token': token } })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`${API}/kiosk-logs/recent`, { headers: { 'X-Admin-Token': token } })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`${API}/bridge/status`, { headers: { 'X-Admin-Token': token } })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const kioskAgo = kioskStatus ? kioskStatus.last_ping_seconds_ago : -1;
      const bridgeAgo = bridgeStatus ? bridgeStatus.last_heartbeat_seconds_ago : -1;
      const lastSyncAgo = bridgeStatus
        ? bridgeStatus.last_successful_sync_seconds_ago
        : -1;
      const bridgeState =
        bridgeAgo < 0
          ? 'offline'
          : bridgeAgo < 300 && lastSyncAgo >= 0 && lastSyncAgo < 600
            ? 'online'
            : bridgeAgo < 300
              ? 'warning'
              : 'offline';
      setData({
        server: health.status === 'ok' ? 'online' : 'error',
        users: users ? users.total : '?',
        kiosk:
          kioskAgo >= 0 && kioskAgo < 60
            ? 'online'
            : kioskAgo >= 0
              ? 'warning'
              : 'offline',
        kiosk_ago: kioskAgo,
        bridge: bridgeState,
        bridge_ago: bridgeAgo,
        bridge_last_sync_ago: lastSyncAgo,
        bridge_pending: bridgeStatus ? bridgeStatus.pending_retries : 0,
        bridge_total_users: bridgeStatus ? bridgeStatus.total_users : 0,
        bridge_error: bridgeStatus ? bridgeStatus.error : null,
        bridge_events: bridgeStatus ? bridgeStatus.recent_events || [] : [],
        terminals: bridgeStatus ? bridgeStatus.terminals : {},
        timestamp: new Date().toLocaleTimeString('es-MX'),
      });
    } catch {
      setData((prev) => (prev ? { ...prev, server: 'error' } : null));
    }
  };

  useEffect(() => {
    if (!authed) return;
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 10000);
    return () => clearInterval(pollRef.current);
  }, [authed, token]);

  if (!authed)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs animate-fade-in">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-black text-mute-amber mute-glow-sm">MUTE.</h1>
            <p className="text-mute-muted text-[10px] uppercase tracking-[0.3em] mt-1">
              Monitor
            </p>
          </div>
          <form onSubmit={login} className="space-y-5">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-mute text-center"
              placeholder="Contraseña"
              autoFocus
              required
            />
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button type="submit" className="btn-mute w-full py-3 text-sm">
              Entrar
            </button>
          </form>
        </div>
      </div>
    );

  const statusDot = (s) =>
    s === 'online' ? 'bg-green-400' : s === 'error' ? 'bg-red-400' : 'bg-yellow-400';
  const statusText = (s) =>
    s === 'online' ? 'Online' : s === 'error' ? 'Error' : 'Desconocido';

  return (
    <div className="min-h-screen px-4 md:px-6 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black text-mute-amber mute-glow-sm tracking-tight">
            MUTE.
          </h1>
          <span className="text-mute-muted text-xs uppercase tracking-[0.2em]">
            Monitor
          </span>
        </div>
        {data && (
          <span className="text-mute-muted/30 text-[10px] font-mono">
            {data.timestamp}
          </span>
        )}
      </div>

      {data ? (
        <div className="space-y-4">
          <div className="card-mute rounded-sm p-5 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${statusDot(data.server)} animate-pulse`}
                />
                <div>
                  <p className="font-bold text-sm">Servidor (VPS)</p>
                  <p className="text-mute-muted text-[10px]">mute.humanhood.mx</p>
                </div>
              </div>
              <span className="text-xs text-mute-muted uppercase tracking-wider">
                {statusText(data.server)}
              </span>
            </div>
          </div>

          <div className="card-mute rounded-sm p-5 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${data.users !== '?' ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}
                />
                <div>
                  <p className="font-bold text-sm">Base de datos</p>
                  <p className="text-mute-muted text-[10px]">PostgreSQL</p>
                </div>
              </div>
              <span className="text-2xl font-black text-white">{data.users}</span>
            </div>
            <p className="text-mute-muted/40 text-[10px] mt-2">usuarios registrados</p>
          </div>

          <div className="card-mute rounded-sm p-5 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${statusDot(data.kiosk)} animate-pulse`}
                />
                <div>
                  <p className="font-bold text-sm">Kiosk (Mini PC)</p>
                  <p className="text-mute-muted text-[10px]">
                    {data.kiosk_ago >= 0
                      ? `Ultimo ping: hace ${data.kiosk_ago}s`
                      : 'Sin conexion'}
                  </p>
                </div>
              </div>
              <span className="text-xs text-mute-muted uppercase tracking-wider">
                {data.kiosk === 'online'
                  ? 'Online'
                  : data.kiosk === 'warning'
                    ? `Hace ${data.kiosk_ago}s`
                    : 'Offline'}
              </span>
            </div>
          </div>

          <div className="card-mute rounded-sm p-5 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${statusDot(data.bridge)} animate-pulse`}
                />
                <div>
                  <p className="font-bold text-sm">Bridge (sync Hikvision)</p>
                  <p className="text-mute-muted text-[10px]">
                    {data.bridge_last_sync_ago >= 0
                      ? `Última sync OK: hace ${data.bridge_last_sync_ago < 60 ? data.bridge_last_sync_ago + 's' : Math.floor(data.bridge_last_sync_ago / 60) + 'min'}`
                      : 'Sin sync exitosa aún'}
                    {data.bridge_ago >= 0 && ` · heartbeat hace ${data.bridge_ago}s`}
                    {data.bridge_pending > 0 && ` · ${data.bridge_pending} pendientes`}
                  </p>
                </div>
              </div>
              <span className="text-xs text-mute-muted uppercase tracking-wider">
                {data.bridge === 'online'
                  ? 'Online'
                  : data.bridge === 'warning'
                    ? 'Sincronizando'
                    : 'Offline'}
              </span>
            </div>
            {data.bridge_error && (
              <p className="text-red-400/70 text-[10px] mt-2 font-mono truncate">
                Error: {data.bridge_error}
              </p>
            )}
          </div>

          {Object.entries(data.terminals || {}).map(([ip, t], i) => {
            const termState =
              data.bridge === 'offline'
                ? 'unknown'
                : t.reachable
                  ? 'online'
                  : t.reachable === false
                    ? 'offline'
                    : 'unknown';
            const termDot =
              termState === 'online'
                ? 'bg-green-400'
                : termState === 'offline'
                  ? 'bg-red-400'
                  : 'bg-mute-muted/30';
            const total = data.bridge_total_users || 0;
            return (
              <div key={ip} className="card-mute rounded-sm p-5 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${termDot} ${termState === 'online' ? 'animate-pulse' : ''}`}
                    />
                    <div>
                      <p className="font-bold text-sm">{t.name || `Terminal ${i + 1}`}</p>
                      <p className="text-mute-muted text-[10px]">
                        {ip} · {t.synced_count}
                        {total > 0 ? `/${total}` : ''} sincronizados
                        {t.pending > 0 ? ` · ${t.pending} pendientes` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-mute-muted/60 uppercase tracking-wider">
                    {termState === 'online'
                      ? 'Online'
                      : termState === 'offline'
                        ? 'Offline'
                        : 'Desconocido'}
                  </span>
                </div>
              </div>
            );
          })}
          {(!data.terminals || Object.keys(data.terminals).length === 0) && (
            <p className="text-mute-muted/30 text-[10px] text-center">
              Sin datos de terminales (bridge offline)
            </p>
          )}

          <div className="card-mute rounded-sm p-5 border border-white/5">
            <p className="font-bold text-sm mb-3">Actividad del bridge</p>
            {(data.bridge_events || []).length === 0 ? (
              <p className="text-mute-muted/30 text-[10px]">Sin actividad reciente</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {[...data.bridge_events].reverse().map((evt, i) => (
                  <p key={i} className="text-[10px] font-mono text-mute-muted/70">
                    {evt}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="card-mute rounded-sm p-5 border border-white/5">
            <p className="font-bold text-sm mb-3">Cámara del kiosk (scans)</p>
            <BridgeLogs token={token} />
          </div>

          <p className="text-center text-mute-muted/20 text-[9px] uppercase tracking-wider mt-6">
            Actualizando cada 10 segundos
          </p>
        </div>
      ) : (
        <p className="text-center text-mute-muted animate-pulse text-xs">Cargando...</p>
      )}
    </div>
  );
}

function BridgeLogs({ token }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const r = await fetch('/api/../health');
        if (!r.ok) return;
        const logsR = await fetch(`/api/kiosk-logs/recent`, {
          headers: { 'X-Admin-Token': token },
        });
        if (logsR.ok) {
          const data = await logsR.json();
          setLogs(data.logs || []);
        }
      } catch {}
    };
    fetchLogs();
    const id = setInterval(fetchLogs, 15000);
    return () => clearInterval(id);
  }, [token]);

  if (logs.length === 0)
    return <p className="text-mute-muted/30 text-[10px]">Sin logs recientes</p>;

  return (
    <div className="max-h-40 overflow-y-auto space-y-1">
      {logs.map((log, i) => (
        <p key={i} className="text-[10px] font-mono text-mute-muted/50">
          {log}
        </p>
      ))}
    </div>
  );
}
