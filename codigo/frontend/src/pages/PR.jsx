import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Spinner from '../components/Spinner';

const API = '/api';

function PRLoginGate({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/pr/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error('Credenciales incorrectas');
      const data = await res.json();
      localStorage.setItem('mute_pr_token', data.token);
      localStorage.setItem('mute_pr_name', data.nombre);
      onLogin(data.token, data.nombre);
    } catch {
      setError('Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs animate-fade-in">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-black text-mute-amber mute-glow-sm">MUTE.</h1>
          <p className="text-mute-muted text-[10px] uppercase tracking-[0.3em] mt-1">
            PR Panel
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-mute"
            placeholder="Usuario"
            autoFocus
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-mute"
            placeholder="Contraseña"
            required
          />
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          {loading ? (
            <Spinner text="Verificando..." />
          ) : (
            <button type="submit" className="btn-mute w-full py-3 text-sm">
              Entrar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function PR() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('mute_pr_token'));
  const [token, setToken] = useState(localStorage.getItem('mute_pr_token') || '');
  const [prName, setPrName] = useState(localStorage.getItem('mute_pr_name') || '');
  const [invites, setInvites] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [passType, setPassType] = useState('one_night');
  const [validDate, setValidDate] = useState(new Date().toISOString().split('T')[0]);
  const [accessBefore, setAccessBefore] = useState('');
  const [inviteFilter, setInviteFilter] = useState('available');

  const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': token };

  const fetchInvites = async () => {
    try {
      const res = await fetch(`${API}/pr/invites`, { headers });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      const data = await res.json();
      setInvites(data);
    } catch {
      setInvites([]);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/pr/stats`, { headers });
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (!authed) return;
    fetchInvites();
    fetchStats();
  }, [authed]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/pr/invites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cantidad: genCount,
          valid_date: passType === 'permanent' ? null : validDate,
          access_before: passType === 'one_night' && accessBefore ? accessBefore : null,
        }),
      });
      fetchInvites();
      fetchStats();
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    const available = invites.filter((i) => !i.used);
    if (!available.length) return;
    const csv =
      'PIN,Estado,Fecha valida,Acceso antes de,Creado\n' +
      available
        .map(
          (i) =>
            `${i.code},Disponible,${i.valid_date || 'Sin limite'},${i.access_before || 'Sin limite'},${new Date(i.created_at).toLocaleDateString('es-MX')}`,
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mute-pins-${prName}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    localStorage.removeItem('mute_pr_token');
    localStorage.removeItem('mute_pr_name');
    setAuthed(false);
  };

  const handleLogin = (tok, name) => {
    setToken(tok);
    setPrName(name);
    setAuthed(true);
  };

  if (!authed) return <PRLoginGate onLogin={handleLogin} />;

  return (
    <div className="min-h-screen px-4 md:px-6 py-6 md:py-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 md:mb-10">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Link
            to="/"
            className="text-mute-amber text-lg md:text-xl font-black tracking-tight mute-glow-sm"
          >
            MUTE.
          </Link>
          <span className="text-mute-muted text-[10px] md:text-xs uppercase tracking-[0.15em] md:tracking-[0.2em] truncate">
            PR · {prName}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-mute-muted/40 text-[10px] uppercase tracking-wider hover:text-red-400 transition-colors flex-shrink-0"
        >
          Salir
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-8">
          <div className="card-mute rounded-sm p-3 md:p-5 text-center">
            <p className="text-2xl md:text-3xl font-black text-white">
              {stats.total_invites}
            </p>
            <p className="text-mute-muted text-[9px] md:text-[10px] uppercase tracking-[0.1em] md:tracking-[0.2em] mt-1">
              Generados
            </p>
          </div>
          <div className="card-mute rounded-sm p-3 md:p-5 text-center">
            <p className="text-2xl md:text-3xl font-black text-mute-amber">
              {stats.used_invites}
            </p>
            <p className="text-mute-muted text-[9px] md:text-[10px] uppercase tracking-[0.1em] md:tracking-[0.2em] mt-1">
              Usados
            </p>
          </div>
          <div className="card-mute rounded-sm p-3 md:p-5 text-center">
            <p className="text-2xl md:text-3xl font-black text-green-400">
              {stats.registered_users}
            </p>
            <p className="text-mute-muted text-[9px] md:text-[10px] uppercase tracking-[0.1em] md:tracking-[0.2em] mt-1">
              Registrados
            </p>
          </div>
        </div>
      )}

      <div className="card-mute rounded-sm p-4 md:p-6 mb-6 md:mb-8 border border-white/5">
        <label className="block text-[11px] text-mute-muted mb-4 uppercase tracking-[0.2em]">
          Generar PINs
        </label>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setPassType('one_night')}
            className={`py-3 px-3 md:px-4 rounded-sm text-[11px] md:text-xs uppercase tracking-wider border transition-all ${passType === 'one_night' ? 'bg-mute-amber/10 text-mute-amber border-mute-amber/30' : 'bg-white/[0.02] text-mute-muted border-white/5 hover:text-white'}`}
          >
            Una noche
          </button>
          <button
            type="button"
            onClick={() => setPassType('permanent')}
            className={`py-3 px-3 md:px-4 rounded-sm text-[11px] md:text-xs uppercase tracking-wider border transition-all ${passType === 'permanent' ? 'bg-mute-amber/10 text-mute-amber border-mute-amber/30' : 'bg-white/[0.02] text-mute-muted border-white/5 hover:text-white'}`}
          >
            Permanente
          </button>
        </div>

        <div
          className={`grid gap-3 md:gap-4 mb-4 ${passType === 'one_night' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
        >
          <div>
            <label className="block text-[10px] text-mute-muted/60 mb-1">Cantidad</label>
            <input
              type="number"
              min="1"
              max="50"
              value={genCount}
              onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
              className="input-mute w-full text-center"
            />
          </div>
          {passType === 'one_night' && (
            <div>
              <label className="block text-[10px] text-mute-muted/60 mb-1">Noche</label>
              <input
                type="date"
                value={validDate}
                onChange={(e) => setValidDate(e.target.value)}
                className="input-mute w-full"
                required
              />
            </div>
          )}
        </div>

        {passType === 'one_night' && (
          <div className="mb-4">
            <label className="block text-[10px] text-mute-muted/60 mb-1">
              Llegar antes de (opcional)
            </label>
            <input
              type="time"
              value={accessBefore}
              onChange={(e) => setAccessBefore(e.target.value)}
              className="input-mute w-full"
              placeholder="23:00"
            />
            <p className="text-mute-muted/40 text-[10px] mt-2 leading-relaxed">
              {accessBefore
                ? `Acceso de 21:00 a ${accessBefore} (CDMX). Despues no pasan.`
                : 'Sin limite. Acceso de 21:00 a 04:00 del dia siguiente (CDMX).'}
            </p>
          </div>
        )}
        {passType === 'permanent' && (
          <p className="text-mute-muted/40 text-[10px] mb-4 leading-relaxed">
            Acceso sin restriccion de fecha ni hora.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleGenerate}
            className="btn-mute py-3 px-6 text-xs flex-1"
            disabled={loading}
          >
            {loading ? 'Generando...' : 'Generar PINs'}
          </button>
          <button
            onClick={handleExportCSV}
            className="btn-mute-outline py-3 px-5 text-xs"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          {
            value: 'available',
            label: `Disponibles (${invites.filter((i) => !i.used).length})`,
          },
          { value: 'used', label: `Usados (${invites.filter((i) => i.used).length})` },
          { value: 'all', label: `Todos (${invites.length})` },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setInviteFilter(f.value)}
            className={`px-4 py-2 rounded-sm text-[11px] font-semibold uppercase tracking-[0.15em] transition-all duration-200 ${
              inviteFilter === f.value
                ? 'bg-mute-amber text-mute-black'
                : 'bg-white/[0.03] text-mute-muted border border-white/5 hover:border-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {invites
          .filter(
            (inv) =>
              inviteFilter === 'all' || (inviteFilter === 'used' ? inv.used : !inv.used),
          )
          .map((inv) => {
            const oneNight = !!inv.valid_date;
            const borderClass = inv.used
              ? 'border-white/[0.03] opacity-50'
              : oneNight
                ? 'border-red-500/30 bg-red-500/[0.02]'
                : 'border-mute-amber/10';
            const codeClass = inv.used
              ? 'text-mute-muted/40 line-through'
              : oneNight
                ? 'text-red-400'
                : 'text-mute-amber';
            return (
              <div
                key={inv.id}
                className={`card-mute rounded-sm px-4 md:px-5 py-3 border ${borderClass}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                  <span
                    className={`font-mono text-base md:text-lg font-bold tracking-[0.3em] md:tracking-[0.4em] ${codeClass}`}
                  >
                    {inv.code}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {oneNight ? (
                      <span className="text-[10px] uppercase tracking-wider text-red-400/80">
                        1 noche · {inv.valid_date}
                        {inv.access_before
                          ? ` < ${String(inv.access_before).slice(0, 5)}`
                          : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-mute-muted/60">
                        Permanente
                      </span>
                    )}
                    {inv.used ? (
                      <span className="text-[10px] text-mute-muted/40 uppercase tracking-wider">
                        Usado
                      </span>
                    ) : (
                      <span className="text-[10px] text-green-400/60 uppercase tracking-wider">
                        Disponible
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        {invites.length === 0 ? (
          <p className="text-center text-mute-muted/40 py-12 text-xs uppercase tracking-wider">
            No has generado PINs aun
          </p>
        ) : invites.filter(
            (inv) =>
              inviteFilter === 'all' || (inviteFilter === 'used' ? inv.used : !inv.used),
          ).length === 0 ? (
          <p className="text-center text-mute-muted/40 py-12 text-xs uppercase tracking-wider">
            No hay PINs en esta categoria
          </p>
        ) : null}
      </div>
    </div>
  );
}
