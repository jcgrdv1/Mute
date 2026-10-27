import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  adminLogin,
  getUsers,
  updateUser,
  deleteUser,
  createInvites,
  getInvites,
  deleteInvite,
  bulkUpdateStatus,
  banOldestActive,
  getCapacity,
} from '../api';
import Spinner from '../components/Spinner';
import Triage from './Triage';

function normalize(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function usePagination(items, matchFn, defaultPageSize = 50) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(query).trim();
    if (!q) return items;
    return items.filter((it) => matchFn(it, q));
  }, [items, query, matchFn]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);
  const total = filtered.length;
  const size = pageSize === 'all' ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * size;
  const visible = pageSize === 'all' ? filtered : filtered.slice(start, start + size);

  return {
    visible,
    total,
    page: safePage,
    totalPages,
    setPage,
    pageSize,
    setPageSize,
    query,
    setQuery,
  };
}

function TableToolbar({ pag, placeholder = 'Buscar nombre, telefono...' }) {
  return (
    <div className="flex flex-col md:flex-row gap-3 mb-4">
      <input
        type="text"
        value={pag.query}
        onChange={(e) => pag.setQuery(e.target.value)}
        placeholder={placeholder}
        className="input-mute flex-1"
      />
      <select
        value={pag.pageSize}
        onChange={(e) =>
          pag.setPageSize(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
        }
        className="input-mute md:w-48"
      >
        <option value={20}>20 por pagina</option>
        <option value={50}>50 por pagina</option>
        <option value={100}>100 por pagina</option>
        <option value="all">Todos ({pag.total})</option>
      </select>
    </div>
  );
}

function TableFooter({ pag }) {
  if (pag.total === 0) return null;
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4 text-[11px] text-mute-muted">
      <span>
        {pag.total} resultado{pag.total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => pag.setPage((p) => Math.max(1, p - 1))}
          disabled={pag.page <= 1}
          className="px-3 py-1.5 border border-white/10 rounded-sm uppercase tracking-[0.15em] text-[10px] disabled:opacity-30 hover:bg-white/5 transition-colors"
        >
          Anterior
        </button>
        <span className="px-2 text-mute-muted/80 min-w-[70px] text-center">
          {pag.page} / {pag.totalPages}
        </span>
        <button
          onClick={() => pag.setPage((p) => Math.min(pag.totalPages, p + 1))}
          disabled={pag.page >= pag.totalPages}
          className="px-3 py-1.5 border border-white/10 rounded-sm uppercase tracking-[0.15em] text-[10px] disabled:opacity-30 hover:bg-white/5 transition-colors"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

function photoUrl(url) {
  if (!url) return null;
  const token = localStorage.getItem('mute_admin_token');
  return `${url}${url.includes('?') ? '&' : '?'}token=${token}`;
}

function LoginGate({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await adminLogin(password);
      localStorage.setItem('mute_admin_token', res.data.token);
      onLogin();
    } catch {
      setError('Contraseña incorrecta');
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
            Admin
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-mute text-center tracking-[0.3em]"
            placeholder="Contraseña"
            autoFocus
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
        <Link
          to="/"
          className="block text-center text-mute-muted/40 text-[10px] uppercase tracking-wider mt-8 hover:text-mute-muted transition-colors"
        >
          Volver
        </Link>
      </div>
    </div>
  );
}

function PhotoModal({ user, onClose }) {
  if (!user) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-mute rounded-sm overflow-hidden border border-white/10">
          {user.foto_url ? (
            <img
              src={photoUrl(user.foto_url)}
              alt={user.nombre}
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div className="w-full aspect-square bg-mute-gray flex items-center justify-center">
              <span className="text-mute-muted/30 text-xs uppercase tracking-wider">
                Sin foto
              </span>
            </div>
          )}
          <div className="p-4">
            <p className="font-bold text-lg">{user.nombre}</p>
            <p className="text-mute-muted text-sm">{user.telefono}</p>
            <p className="text-mute-muted/40 text-[10px] mt-2 uppercase tracking-wider">
              {user.status} - {new Date(user.created_at).toLocaleDateString('es-MX')}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="btn-mute-outline w-full mt-3 py-2 text-xs">
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('mute_admin_token'));
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [invitePassType, setInvitePassType] = useState('permanent');
  const [inviteFilter, setInviteFilter] = useState('available');
  const [inviteValidDate, setInviteValidDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [inviteAccessBefore, setInviteAccessBefore] = useState('');
  const [prMap, setPrMap] = useState({});
  const [photoUser, setPhotoUser] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [capacity, setCapacity] = useState(null);
  const [sortBy, setSortBy] = useState('date');

  const sortedUsers = useMemo(() => {
    if (sortBy === 'access_desc')
      return [...users].sort((a, b) => (b.access_count || 0) - (a.access_count || 0));
    if (sortBy === 'access_asc')
      return [...users].sort((a, b) => (a.access_count || 0) - (b.access_count || 0));
    return users;
  }, [users, sortBy]);

  const userMatch = useCallback(
    (u, q) =>
      normalize(u.nombre).includes(q) ||
      normalize(u.telefono).includes(q) ||
      normalize(u.invite_code_used || '').includes(q) ||
      normalize(prMap[u.invited_by_pr_id] || '').includes(q),
    [prMap],
  );
  const usersPag = usePagination(sortedUsers, userMatch);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const visibleIds = useMemo(() => usersPag.visible.map((u) => u.id), [usersPag.visible]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  useEffect(() => {
    if (selected.size === 0) return;
    const live = new Set(users.map((u) => u.id));
    let changed = false;
    const next = new Set();
    for (const id of selected) {
      if (live.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelected(next);
  }, [users]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await getUsers(filter || undefined);
      setUsers(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('mute_admin_token');
        setAuthed(false);
      }
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvites = async () => {
    setInvLoading(true);
    try {
      const res = await getInvites();
      setInvites(res.data);
    } catch {
      setInvites([]);
    } finally {
      setInvLoading(false);
    }
  };

  const fetchPrMap = async () => {
    const token = localStorage.getItem('mute_admin_token');
    try {
      const r = await fetch('/api/admin/pr-users', {
        headers: { 'X-Admin-Token': token },
      });
      if (!r.ok) return;
      const list = await r.json();
      const m = {};
      for (const p of list) m[p.id] = p.nombre;
      setPrMap(m);
    } catch {}
  };

  const fetchCapacity = async () => {
    try {
      const r = await getCapacity();
      setCapacity(r.data);
    } catch {}
  };

  useEffect(() => {
    if (!authed) return;
    if (tab === 'users') {
      fetchUsers();
      fetchPrMap();
      fetchCapacity();
    }
    if (tab === 'invites') fetchInvites();
    if (tab === 'pr') fetchPrMap();
  }, [authed, tab, filter]);

  useEffect(() => {
    if (!authed || tab !== 'users') return;
    const id = setInterval(fetchCapacity, 30000);
    return () => clearInterval(id);
  }, [authed, tab]);

  const handleStatus = async (id, status) => {
    await updateUser(id, { status });
    fetchUsers();
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar este usuario?')) return;
    try {
      await deleteUser(id);
      setPhotoUser((prev) => (prev && prev.id === id ? null : prev));
      setSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchUsers();
      fetchCapacity();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al eliminar usuario');
    }
  };

  const handleSetTemporal = async (u) => {
    const token = localStorage.getItem('mute_admin_token');
    let body;
    if (u.valid_date) {
      if (!confirm(`Hacer permanente a ${u.nombre}? Podra entrar siempre.`)) return;
      body = { valid_date: null };
    } else {
      const today = new Date().toISOString().split('T')[0];
      const date = prompt(`Bajar a 1 noche. Fecha (YYYY-MM-DD):`, today);
      if (!date) return;
      body = { valid_date: date };
    }
    await fetch(`/api/users/${u.id}/temporal`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify(body),
    });
    fetchUsers();
  };

  const runBulk = async (label, action) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`${label} a ${ids.length} usuario${ids.length === 1 ? '' : 's'}?`))
      return;
    setBulkBusy(true);
    let ok = 0,
      fail = 0;
    try {
      for (const id of ids) {
        try {
          await action(id);
          ok++;
        } catch {
          fail++;
        }
      }
    } finally {
      setBulkBusy(false);
      await fetchUsers();
      if (fail > 0) alert(`${ok} aplicados, ${fail} fallaron.`);
    }
  };
  const bulkSetStatus = async (status) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Marcar como ${status} a ${ids.length} usuario${ids.length === 1 ? '' : 's'}?`,
      )
    )
      return;
    setBulkBusy(true);
    try {
      await bulkUpdateStatus(ids, status);
    } catch {
      alert('Error aplicando el cambio masivo');
    } finally {
      setBulkBusy(false);
      await fetchUsers();
      fetchCapacity();
    }
  };

  const handleBanOldest = async () => {
    if (!capacity) {
      alert('Capacidad cargando, intenta en un momento.');
      return;
    }
    const free = capacity.free_in_db;
    const suggested = Math.max(50, Math.max(0, capacity.warn_at - free) + 50);
    const raw = prompt(
      `Capacidad: ${capacity.active_users}/${capacity.terminal_cap} activos.\n\n` +
        `Cuántos de los más antiguos baneo? (deja vacío para cancelar)`,
      String(suggested),
    );
    if (!raw) return;
    const count = parseInt(raw, 10);
    if (!Number.isFinite(count) || count <= 0) return;
    const skip = parseInt(
      prompt(`Saltar los primeros N (sentinel staff/VIPs que NO quieres tocar):`, '0') ||
        '0',
      10,
    );
    if (
      !confirm(
        `Banear ${count} más antiguos saltando los primeros ${skip}? El bridge los borrará de los terminales.`,
      )
    )
      return;
    setBulkBusy(true);
    try {
      // banea a los mas viejos menos a los vip
      const r = await banOldestActive(count, skip);
      alert(
        `Baneados: ${r.data.banned}. El bridge los borrará en su próximo ciclo (~30s).`,
      );
    } catch {
      alert('Error baneando.');
    } finally {
      setBulkBusy(false);
      await fetchUsers();
      fetchCapacity();
    }
  };
  const bulkDelete = async () => {
    await runBulk('Eliminar', (id) => deleteUser(id));
    setPhotoUser(null);
    fetchCapacity();
  };
  const bulkSetPermanent = () => {
    const token = localStorage.getItem('mute_admin_token');
    runBulk('Hacer permanente', async (id) => {
      const r = await fetch(`/api/users/${id}/temporal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ valid_date: null }),
      });
      if (!r.ok) throw new Error();
    });
  };
  const bulkSetOneNight = () => {
    const today = new Date().toISOString().split('T')[0];
    const date = prompt(
      'Pase de 1 noche para los seleccionados. Fecha (YYYY-MM-DD):',
      today,
    );
    if (!date) return;
    const token = localStorage.getItem('mute_admin_token');
    runBulk(`Pase de 1 noche (${date})`, async (id) => {
      const r = await fetch(`/api/users/${id}/temporal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ valid_date: date }),
      });
      if (!r.ok) throw new Error();
    });
  };

  const handleGenerate = async () => {
    await createInvites({
      cantidad: genCount,
      valid_date: invitePassType === 'permanent' ? null : inviteValidDate,
      access_before:
        invitePassType === 'one_night' && inviteAccessBefore ? inviteAccessBefore : null,
    });
    fetchInvites();
  };

  const handleDeleteInvite = async (code) => {
    await deleteInvite(code);
    fetchInvites();
  };

  const handleLogout = () => {
    localStorage.removeItem('mute_admin_token');
    setAuthed(false);
  };

  if (!authed) return <LoginGate onLogin={() => setAuthed(true)} />;

  const statusBadge = {
    registered: 'bg-white/5 text-mute-light border-white/10',
    vip: 'bg-mute-amber/10 text-mute-amber border-mute-amber/20',
    banned: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  return (
    <div className="min-h-screen px-4 md:px-6 py-6 md:py-10 max-w-6xl mx-auto">
      <PhotoModal user={photoUser} onClose={() => setPhotoUser(null)} />

      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-mute-amber text-xl font-black tracking-tight mute-glow-sm"
          >
            MUTE.
          </Link>
          <span className="text-mute-muted text-xs uppercase tracking-[0.2em]">
            Admin
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-mute-muted/40 text-[10px] uppercase tracking-wider hover:text-red-400 transition-colors"
        >
          Salir
        </button>
      </div>

      <div className="flex mb-6 md:mb-8 border-b border-white/5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        {[
          { key: 'users', label: 'Usuarios' },
          { key: 'triage', label: 'Triaje' },
          { key: 'invites', label: 'PINs' },
          { key: 'pr', label: 'PRs' },
          { key: 'reports', label: 'Reportes' },
          { key: 'settings', label: 'Config' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 md:px-6 pb-3 text-[11px] font-semibold uppercase tracking-[0.15em] md:tracking-[0.2em] transition-all duration-200 border-b-2 whitespace-nowrap flex-shrink-0 ${
              tab === t.key
                ? 'text-mute-amber border-mute-amber'
                : 'text-mute-muted border-transparent hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total', value: users.length, color: 'text-white' },
              {
                label: 'VIP',
                value: users.filter((u) => u.status === 'vip').length,
                color: 'text-mute-amber',
              },
              {
                label: 'Baneados',
                value: users.filter((u) => u.status === 'banned').length,
                color: 'text-red-400',
              },
            ].map((s) => (
              <div key={s.label} className="card-mute rounded-sm p-5 text-center">
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-mute-muted text-[10px] uppercase tracking-[0.2em] mt-1">
                  {s.label}
                </p>
              </div>
            ))}
            {capacity &&
              (() => {
                const lvl = capacity.level;
                const ring =
                  lvl === 'critical'
                    ? 'border-red-500/50 bg-red-500/5'
                    : lvl === 'warning'
                      ? 'border-mute-amber/40 bg-mute-amber/5'
                      : 'card-mute';
                const tone =
                  lvl === 'critical'
                    ? 'text-red-400'
                    : lvl === 'warning'
                      ? 'text-mute-amber'
                      : 'text-white';
                return (
                  <div className={`rounded-sm p-5 text-center border ${ring}`}>
                    <p className={`text-3xl font-black ${tone}`}>
                      {capacity.active_users}/{capacity.terminal_cap}
                    </p>
                    <p className="text-mute-muted text-[10px] uppercase tracking-[0.2em] mt-1">
                      Capacidad terminal · {capacity.free_in_db} libres
                    </p>
                  </div>
                );
              })()}
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { value: '', label: 'Todos' },
              { value: 'registered', label: 'Registrados' },
              { value: 'vip', label: 'VIP' },
              { value: 'banned', label: 'Baneados' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-sm text-[11px] font-semibold uppercase tracking-[0.15em] transition-all duration-200 ${
                  filter === f.value
                    ? 'bg-mute-amber text-mute-black'
                    : 'bg-white/[0.03] text-mute-muted border border-white/5 hover:border-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
            {capacity && capacity.level !== 'ok' && (
              <button
                onClick={handleBanOldest}
                disabled={bulkBusy}
                title="Banea los N más antiguos para liberar slots; el bridge propaga el delete a los terminales."
                className="ml-auto px-4 py-2 rounded-sm text-[11px] font-bold uppercase tracking-[0.15em] bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-40"
              >
                Liberar slots
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <span className="text-mute-muted text-[10px] uppercase tracking-wider self-center mr-1">
              Ordenar:
            </span>
            {[
              { value: 'date', label: 'Fecha' },
              { value: 'access_desc', label: 'Asistencias ↓' },
              { value: 'access_asc', label: 'Asistencias ↑' },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setSortBy(s.value)}
                className={`px-3 py-1.5 rounded-sm text-[10px] font-semibold uppercase tracking-[0.1em] transition-all duration-200 ${
                  sortBy === s.value
                    ? 'bg-mute-amber text-mute-black'
                    : 'bg-white/[0.03] text-mute-muted border border-white/5 hover:border-white/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <TableToolbar
            pag={usersPag}
            placeholder="Buscar nombre, telefono, PIN, PR..."
          />

          {selected.size > 0 && (
            <div className="card-mute rounded-sm border border-mute-amber/30 bg-mute-amber/5 p-3 mb-4 flex flex-wrap items-center gap-2">
              <span className="text-mute-amber font-bold text-xs uppercase tracking-[0.15em] mr-2">
                {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
              </span>
              <button
                onClick={bulkSetPermanent}
                disabled={bulkBusy}
                className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 disabled:opacity-40 transition-colors"
              >
                Permanente
              </button>
              <button
                onClick={bulkSetOneNight}
                disabled={bulkBusy}
                className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 disabled:opacity-40 transition-colors"
              >
                1 noche
              </button>
              <button
                onClick={() => bulkSetStatus('vip')}
                disabled={bulkBusy}
                className="px-3 py-1.5 bg-mute-amber/10 text-mute-amber border border-mute-amber/20 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-mute-amber/20 disabled:opacity-40 transition-colors"
              >
                VIP
              </button>
              <button
                onClick={() => bulkSetStatus('banned')}
                disabled={bulkBusy}
                className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/20 disabled:opacity-40 transition-colors"
              >
                Ban
              </button>
              <button
                onClick={() => bulkSetStatus('registered')}
                disabled={bulkBusy}
                className="px-3 py-1.5 bg-white/5 text-mute-muted border border-white/10 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 disabled:opacity-40 transition-colors"
              >
                Normal
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkBusy}
                className="px-3 py-1.5 bg-white/[0.02] text-mute-muted/70 border border-white/10 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 disabled:opacity-40 transition-colors"
              >
                Eliminar
              </button>
              <button
                onClick={clearSelection}
                disabled={bulkBusy}
                className="ml-auto px-3 py-1.5 text-mute-muted text-[10px] uppercase tracking-wider hover:text-white disabled:opacity-40 transition-colors"
              >
                Limpiar
              </button>
            </div>
          )}

          {loading ? (
            <Spinner text="Cargando..." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="pb-3 pr-3 w-8">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={togglePage}
                        className="w-4 h-4 accent-mute-amber cursor-pointer"
                        title="Seleccionar pagina"
                      />
                    </th>
                    {[
                      '',
                      'Nombre',
                      'Asist.',
                      'Telefono',
                      'Status',
                      'Pase',
                      'Invitado por',
                      'Registro',
                      'Acciones',
                    ].map((h) => (
                      <th
                        key={h}
                        className="pb-3 pr-4 text-[10px] text-mute-muted uppercase tracking-[0.2em] font-medium"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usersPag.visible.map((u) => (
                    <tr
                      key={u.id}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${selected.has(u.id) ? 'bg-mute-amber/[0.04]' : ''}`}
                    >
                      <td className="py-3 pr-3">
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleOne(u.id)}
                          className="w-4 h-4 accent-mute-amber cursor-pointer"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => setPhotoUser(u)}
                          className="w-10 h-10 rounded-sm overflow-hidden border border-white/10 hover:border-mute-amber/40 transition-colors flex-shrink-0"
                        >
                          {u.foto_url ? (
                            <img
                              src={photoUrl(u.foto_url)}
                              alt={u.nombre}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-mute-gray flex items-center justify-center">
                              <span className="text-mute-muted/20 text-[8px]">?</span>
                            </div>
                          )}
                        </button>
                      </td>
                      <td className="py-3 pr-4 font-semibold text-sm">{u.nombre}</td>
                      <td className="py-3 pr-4 text-center">
                        <span
                          className={`text-xs font-bold ${u.access_count > 0 ? 'text-green-400' : 'text-mute-muted/40'}`}
                        >
                          {u.access_count || 0}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-mute-muted text-sm">{u.telefono}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider border ${statusBadge[u.status]}`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {u.valid_date ? (
                          <span
                            className="px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            title={`Acceso solo el ${u.valid_date}${u.access_before ? ` antes de ${u.access_before}` : ''}`}
                          >
                            1 noche · {u.valid_date}
                            {u.access_before ? ` < ${u.access_before}` : ''}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider bg-white/5 text-mute-muted border border-white/10">
                            Permanente
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {u.invited_by_pr_id ? (
                          <span
                            className="text-mute-amber/80"
                            title={u.invite_code_used ? `PIN ${u.invite_code_used}` : ''}
                          >
                            {prMap[u.invited_by_pr_id] || 'PR ?'}
                          </span>
                        ) : u.invite_code_used ? (
                          <span
                            className="text-mute-muted"
                            title={`PIN ${u.invite_code_used}`}
                          >
                            Admin · {u.invite_code_used}
                          </span>
                        ) : (
                          <span className="text-mute-muted/30">-</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-mute-muted/60 text-xs">
                        {new Date(u.created_at).toLocaleDateString('es-MX')}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleSetTemporal(u)}
                            className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors"
                          >
                            {u.valid_date ? 'Permanente' : '1 noche'}
                          </button>
                          {u.status !== 'vip' && (
                            <button
                              onClick={() => handleStatus(u.id, 'vip')}
                              className="px-2.5 py-1 bg-mute-amber/10 text-mute-amber border border-mute-amber/20 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-mute-amber/20 transition-colors"
                            >
                              VIP
                            </button>
                          )}
                          {u.status !== 'banned' && (
                            <button
                              onClick={() => handleStatus(u.id, 'banned')}
                              className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors"
                            >
                              Ban
                            </button>
                          )}
                          {u.status !== 'registered' && (
                            <button
                              onClick={() => handleStatus(u.id, 'registered')}
                              className="px-2.5 py-1 bg-white/5 text-mute-muted border border-white/10 rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
                            >
                              Normal
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="px-2.5 py-1 bg-white/[0.02] text-mute-muted/50 border border-white/5 rounded-sm text-[10px] uppercase tracking-wider hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 ? (
                <p className="text-center text-mute-muted/40 py-12 text-xs uppercase tracking-wider">
                  No hay usuarios registrados
                </p>
              ) : usersPag.total === 0 ? (
                <p className="text-center text-mute-muted/40 py-12 text-xs uppercase tracking-wider">
                  Sin coincidencias
                </p>
              ) : null}
              <TableFooter pag={usersPag} />
            </div>
          )}
        </>
      )}

      {tab === 'invites' && (
        <>
          <div className="card-mute rounded-sm p-4 md:p-6 mb-6 border border-white/5">
            <label className="block text-[11px] text-mute-muted mb-3 uppercase tracking-[0.2em]">
              Generar PINs
            </label>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setInvitePassType('permanent')}
                className={`py-2 px-3 rounded-sm text-[10px] uppercase tracking-wider border transition-all ${invitePassType === 'permanent' ? 'bg-mute-amber/10 text-mute-amber border-mute-amber/30' : 'bg-white/[0.02] text-mute-muted border-white/5 hover:text-white'}`}
              >
                Permanente
              </button>
              <button
                type="button"
                onClick={() => setInvitePassType('one_night')}
                className={`py-2 px-3 rounded-sm text-[10px] uppercase tracking-wider border transition-all ${invitePassType === 'one_night' ? 'bg-mute-amber/10 text-mute-amber border-mute-amber/30' : 'bg-white/[0.02] text-mute-muted border-white/5 hover:text-white'}`}
              >
                Solo una noche
              </button>
            </div>

            {invitePassType === 'one_night' && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] text-mute-muted/60 mb-1">
                    Noche
                  </label>
                  <input
                    type="date"
                    value={inviteValidDate}
                    onChange={(e) => setInviteValidDate(e.target.value)}
                    className="input-mute w-full"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-mute-muted/60 mb-1">
                    Llegar antes de (opcional)
                  </label>
                  <input
                    type="time"
                    value={inviteAccessBefore}
                    onChange={(e) => setInviteAccessBefore(e.target.value)}
                    className="input-mute w-full"
                    placeholder="23:00"
                  />
                </div>
              </div>
            )}

            {invitePassType === 'one_night' && (
              <p className="text-mute-muted/40 text-[10px] mb-3 leading-relaxed">
                {inviteAccessBefore
                  ? `Acceso desde 21:00 hasta ${inviteAccessBefore} de ${inviteValidDate} (CDMX).`
                  : `Acceso desde 21:00 de ${inviteValidDate} hasta 04:00 del dia siguiente (CDMX).`}
              </p>
            )}

            <div className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={genCount}
                  onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
                  className="input-mute w-20 md:w-24 text-center"
                />
                <button
                  onClick={handleGenerate}
                  className="btn-mute py-2.5 md:py-3 px-5 md:px-6 text-xs flex-1 md:flex-none"
                >
                  Generar
                </button>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  onClick={() => {
                    const available = invites.filter((i) => !i.used);
                    if (!available.length) return;
                    const csv =
                      'PIN,Estado,Fecha de creacion\n' +
                      available
                        .map(
                          (i) =>
                            `${i.code},Disponible,${new Date(i.created_at).toLocaleDateString('es-MX')}`,
                        )
                        .join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `mute-pins-${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="btn-mute-outline py-2.5 px-4 text-xs"
                >
                  Exportar CSV
                </button>
                <p className="text-[10px] text-mute-muted/40 uppercase tracking-wider">
                  {invites.filter((i) => !i.used).length} disponibles /{' '}
                  {invites.filter((i) => i.used).length} usados
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              {
                value: 'available',
                label: `Disponibles (${invites.filter((i) => !i.used).length})`,
              },
              {
                value: 'used',
                label: `Usados (${invites.filter((i) => i.used).length})`,
              },
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

          {invLoading ? (
            <Spinner text="Cargando PINs..." />
          ) : (
            <div className="space-y-2">
              {invites
                .filter(
                  (inv) =>
                    inviteFilter === 'all' ||
                    (inviteFilter === 'used' ? inv.used : !inv.used),
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
                      className={`card-mute rounded-sm px-5 py-3 flex items-center justify-between border ${borderClass}`}
                    >
                      <div className="flex items-center gap-4 flex-wrap">
                        <span
                          className={`font-mono text-lg font-bold tracking-[0.4em] ${codeClass}`}
                        >
                          {inv.code}
                        </span>
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
                            {inv.used_at
                              ? ` - ${new Date(inv.used_at).toLocaleDateString('es-MX')}`
                              : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] text-green-400/60 uppercase tracking-wider">
                            Disponible
                          </span>
                        )}
                      </div>
                      {!inv.used && (
                        <button
                          onClick={() => handleDeleteInvite(inv.code)}
                          className="text-mute-muted/30 text-[10px] uppercase tracking-wider hover:text-red-400 transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  );
                })}
              {invites.length === 0 ? (
                <p className="text-center text-mute-muted/40 py-12 text-xs uppercase tracking-wider">
                  No hay PINs generados
                </p>
              ) : invites.filter(
                  (inv) =>
                    inviteFilter === 'all' ||
                    (inviteFilter === 'used' ? inv.used : !inv.used),
                ).length === 0 ? (
                <p className="text-center text-mute-muted/40 py-12 text-xs uppercase tracking-wider">
                  No hay PINs en esta categoria
                </p>
              ) : null}
            </div>
          )}
        </>
      )}

      {tab === 'triage' && <Triage />}

      {tab === 'pr' && <PRTab />}

      {tab === 'reports' && <ReportsTab />}

      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function SettingsTab() {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem('mute_admin_token');

  const handleChange = async (e) => {
    e.preventDefault();
    if (newPass.length < 4) {
      setMsg({ type: 'error', text: 'Minimo 4 caracteres' });
      return;
    }
    if (newPass !== confirmPass) {
      setMsg({ type: 'error', text: 'Las contraseñas no coinciden' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ new_password: newPass }),
      });
      if (res.ok) {
        setMsg({ type: 'ok', text: 'Contraseña actualizada' });
        setNewPass('');
        setConfirmPass('');
      } else {
        const d = await res.json();
        setMsg({ type: 'error', text: d.detail || 'Error' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error de conexion' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm">
      <h3 className="text-[11px] text-mute-muted uppercase tracking-[0.2em] mb-6">
        Cambiar contraseña de admin
      </h3>
      <form onSubmit={handleChange} className="space-y-4">
        <div>
          <label className="block text-[10px] text-mute-muted/60 mb-1">
            Nueva contraseña
          </label>
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            className="input-mute"
            placeholder="Nueva contraseña"
            required
          />
        </div>
        <div>
          <label className="block text-[10px] text-mute-muted/60 mb-1">Confirmar</label>
          <input
            type="password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            className="input-mute"
            placeholder="Repetir contraseña"
            required
          />
        </div>
        {msg && (
          <p
            className={`text-xs text-center ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}
          >
            {msg.text}
          </p>
        )}
        <button type="submit" className="btn-mute w-full py-3 text-xs" disabled={loading}>
          {loading ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
      <p className="text-mute-muted/30 text-[10px] mt-4 leading-relaxed">
        Esta contraseña es para el acceso al panel admin y al kiosk.
      </p>
    </div>
  );
}

function PRTab() {
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const token = localStorage.getItem('mute_admin_token');
  const headers = { 'Content-Type': 'application/json', 'X-Admin-Token': token };

  const fetchPRs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pr-users', { headers });
      if (res.ok) setPrs(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPRs();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/pr-users', {
      method: 'POST',
      headers,
      body: JSON.stringify({ nombre, username, password }),
    });
    setNombre('');
    setUsername('');
    setPassword('');
    fetchPRs();
  };

  const handleToggle = async (id) => {
    await fetch(`/api/admin/pr-users/${id}`, { method: 'PATCH', headers });
    fetchPRs();
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar este PR?')) return;
    await fetch(`/api/admin/pr-users/${id}`, { method: 'DELETE', headers });
    fetchPRs();
  };

  return (
    <>
      <div className="card-mute rounded-sm p-4 md:p-6 mb-6 md:mb-8 border border-white/5">
        <label className="block text-[11px] text-mute-muted mb-4 uppercase tracking-[0.2em]">
          Crear usuario PR
        </label>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="input-mute"
            placeholder="Nombre completo"
            required
          />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-mute"
            placeholder="Usuario (sin espacios)"
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
          <button type="submit" className="btn-mute py-3 text-xs md:col-span-3">
            Crear PR
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-mute-muted text-xs">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {prs.map((pr) => (
            <div
              key={pr.id}
              className={`card-mute rounded-sm px-5 py-3 flex items-center justify-between border ${pr.active ? 'border-mute-amber/10' : 'border-white/[0.03] opacity-50'}`}
            >
              <div>
                <span className="font-semibold text-sm">{pr.nombre}</span>
                <span className="text-mute-muted text-xs ml-3">@{pr.username}</span>
                {!pr.active && (
                  <span className="text-red-400/60 text-[10px] ml-2 uppercase">
                    Desactivado
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggle(pr.id)}
                  className={`px-3 py-1 rounded-sm text-[10px] uppercase tracking-wider transition-colors ${pr.active ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' : 'bg-green-400/10 text-green-400 border border-green-400/20 hover:bg-green-400/20'}`}
                >
                  {pr.active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => handleDelete(pr.id)}
                  className="px-3 py-1 bg-white/[0.02] text-mute-muted/50 border border-white/5 rounded-sm text-[10px] uppercase tracking-wider hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          {prs.length === 0 && (
            <p className="text-center text-mute-muted/40 py-12 text-xs uppercase tracking-wider">
              No hay usuarios PR
            </p>
          )}
        </div>
      )}
    </>
  );
}

function ReportsTab() {
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [top, setTop] = useState(null);
  const [loading, setLoading] = useState(false);

  const visitorMatch = useCallback(
    (v, q) => normalize(v.nombre).includes(q) || normalize(v.telefono).includes(q),
    [],
  );
  const visitorsPag = usePagination(report?.visitors || [], visitorMatch);

  const token = localStorage.getItem('mute_admin_token');
  const headers = { 'X-Admin-Token': token };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?date=${reportDate}`, { headers });
      if (res.ok) setReport(await res.json());
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const fetchTop = async () => {
    try {
      const res = await fetch('/api/admin/reports/top?days=30', { headers });
      if (res.ok) setTop(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchReport();
    fetchTop();
  }, [reportDate]);

  const exportCSV = () => {
    if (!report?.visitors?.length) return;
    const csv =
      'Nombre,Telefono,Status,Primera vez visto,Veces visto\n' +
      report.visitors
        .map(
          (v) => `${v.nombre},${v.telefono},${v.status},${v.first_seen},${v.times_seen}`,
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mute-reporte-${reportDate}.csv`;
    a.click();
  };

  return (
    <>
      <div className="flex gap-4 mb-8 items-end flex-wrap">
        <div>
          <label className="block text-[11px] text-mute-muted mb-2 uppercase tracking-[0.2em]">
            Fecha
          </label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="input-mute"
          />
        </div>
        <button onClick={fetchReport} className="btn-mute py-3 px-6 text-xs">
          Ver reporte
        </button>
        <button onClick={exportCSV} className="btn-mute-outline py-3 px-5 text-xs">
          Exportar reporte
        </button>
        <button
          onClick={() => {
            fetch('/api/admin/export', { headers })
              .then((r) => r.blob())
              .then((b) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(b);
                a.download = 'mute-usuarios.csv';
                a.click();
              });
          }}
          className="btn-mute-outline py-3 px-5 text-xs"
        >
          Exportar todos los usuarios
        </button>
      </div>

      {loading && <p className="text-mute-muted text-xs">Cargando...</p>}

      {report && (
        <div className="mb-10">
          <p className="text-mute-muted/60 text-[10px] uppercase tracking-[0.2em] mb-3">
            Noche del {reportDate} (21:00 a 04:00 hora MX)
          </p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="card-mute rounded-sm p-5 text-center">
              <p className="text-3xl font-black text-white">{report.total_accesses}</p>
              <p className="text-mute-muted text-[10px] uppercase tracking-[0.2em] mt-1">
                Accesos
              </p>
            </div>
            <div className="card-mute rounded-sm p-5 text-center">
              <p className="text-3xl font-black text-mute-amber">
                {report.unique_visitors}
              </p>
              <p className="text-mute-muted text-[10px] uppercase tracking-[0.2em] mt-1">
                Visitantes unicos
              </p>
            </div>
            <div className="card-mute rounded-sm p-5 text-center">
              <p className="text-3xl font-black text-red-400/80">
                {report.unrecognized_attempts ?? 0}
              </p>
              <p className="text-mute-muted text-[10px] uppercase tracking-[0.2em] mt-1">
                No reconocidos
              </p>
            </div>
          </div>

          {report.visitors.length > 0 ? (
            <>
              <TableToolbar pag={visitorsPag} placeholder="Buscar nombre o telefono..." />
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Nombre', 'Telefono', 'Status', 'Hora', 'Veces'].map((h) => (
                        <th
                          key={h}
                          className="pb-3 pr-4 text-[10px] text-mute-muted uppercase tracking-[0.2em] font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visitorsPag.visible.map((v, i) => (
                      <tr key={i} className="border-b border-white/[0.03]">
                        <td className="py-3 pr-4 font-semibold text-sm">{v.nombre}</td>
                        <td className="py-3 pr-4 text-mute-muted text-sm">
                          {v.telefono}
                        </td>
                        <td className="py-3 pr-4 text-xs">{v.status}</td>
                        <td className="py-3 pr-4 text-mute-muted/60 text-xs">
                          {v.first_seen
                            ? new Date(v.first_seen).toLocaleTimeString('es-MX')
                            : '-'}
                        </td>
                        <td className="py-3 text-mute-amber font-bold">{v.times_seen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visitorsPag.total === 0 && (
                  <p className="text-center text-mute-muted/40 py-8 text-xs uppercase">
                    Sin coincidencias
                  </p>
                )}
                <TableFooter pag={visitorsPag} />
              </div>
            </>
          ) : (
            <p className="text-center text-mute-muted/40 py-8 text-xs uppercase">
              Sin accesos este dia
            </p>
          )}
        </div>
      )}

      {top && top.top_visitors.length > 0 && (
        <div>
          <h3 className="text-[11px] text-mute-muted uppercase tracking-[0.2em] mb-4">
            Top visitantes (30 dias)
          </h3>
          <div className="space-y-2">
            {top.top_visitors.slice(0, 10).map((v, i) => (
              <div
                key={i}
                className="card-mute rounded-sm px-5 py-3 flex items-center justify-between border border-white/[0.03]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-mute-amber font-black text-lg w-8">#{i + 1}</span>
                  <span className="font-semibold text-sm">{v.nombre}</span>
                </div>
                <span className="text-mute-amber font-bold">{v.visit_count} visitas</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
