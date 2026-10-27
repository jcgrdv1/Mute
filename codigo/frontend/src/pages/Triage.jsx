import { useEffect, useMemo, useRef, useState } from 'react';
import { getUsers, updateUser, deleteUser } from '../api';

const SWIPE_THRESHOLD = 120;
const HINT_FADE_IN_AT = 50;

const FILTERS = [
  { key: 'registered', label: 'Por triajear' },
  { key: 'vip', label: 'VIP' },
  { key: 'banned', label: 'Baneados' },
  { key: 'all', label: 'Todos' },
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function Triage() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [filter, setFilter] = useState('registered');
  const [reloadKey, setReloadKey] = useState(0);
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getUsers()
      .then((r) => {
        if (!alive) return;
        const filtered = (r.data || []).filter((u) =>
          filter === 'all' ? true : u.status === filter,
        );
        setQueue(shuffle(filtered));
      })
      .catch(() => {
        if (alive) setQueue([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filter, reloadKey]);

  const top = queue[0];
  const next = queue[1];
  const token = useMemo(() => localStorage.getItem('mute_admin_token') || '', []);
  const photoUrl = (id) => `/api/photos/${id}?token=${encodeURIComponent(token)}`;

  const onPointerDown = (e) => {
    if (!top || busyId) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  };
  const onPointerMove = (e) => {
    if (!drag.active) return;
    setDrag({
      x: e.clientX - startRef.current.x,
      y: e.clientY - startRef.current.y,
      active: true,
    });
  };
  const onPointerUp = (e) => {
    if (!drag.active) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    const { x, y } = drag;
    let action = null;
    if (Math.abs(y) > Math.abs(x)) {
      if (-y > SWIPE_THRESHOLD) action = 'up';
      else if (y > SWIPE_THRESHOLD) action = 'down';
    } else {
      if (x > SWIPE_THRESHOLD) action = 'right';
      else if (-x > SWIPE_THRESHOLD) action = 'left';
    }

    if (action) {
      commit(action);
    } else {
      setDrag({ x: 0, y: 0, active: false });
    }
  };

  const commit = async (direction) => {
    if (!top) return;
    const user = top;
    setBusyId(user.id);

    const off =
      direction === 'right'
        ? { x: 700, y: drag.y }
        : direction === 'left'
          ? { x: -700, y: drag.y }
          : direction === 'up'
            ? { x: drag.x, y: -700 }
            : { x: drag.x, y: 700 };
    setDrag({ ...off, active: false });

    const popTimer = setTimeout(() => {
      setQueue((q) => q.slice(1));
      setDrag({ x: 0, y: 0, active: false });
    }, 250);

    try {
      if (direction === 'right') {
        await deleteUser(user.id);
      } else if (direction === 'up') {
        await updateUser(user.id, { status: 'vip' });
      } else if (direction === 'down') {
        await updateUser(user.id, { status: 'banned' });
      }
    } catch (err) {
      clearTimeout(popTimer);
      setQueue((q) => (q[0]?.id === user.id ? q : [user, ...q]));
      setDrag({ x: 0, y: 0, active: false });
      alert(err?.response?.data?.detail || 'Error aplicando la acción');
    } finally {
      setBusyId(null);
    }
  };

  const rotation = drag.x * 0.06;
  const dragMag = Math.max(Math.abs(drag.x), Math.abs(drag.y));
  const cardOpacity = drag.active ? Math.max(0.4, 1 - dragMag / 600) : 1;
  const fade = (v) => Math.min(1, Math.max(0, (Math.abs(v) - HINT_FADE_IN_AT) / 70));
  const horizDominant = Math.abs(drag.x) > Math.abs(drag.y);
  const hintRight = horizDominant && drag.x > HINT_FADE_IN_AT ? fade(drag.x) : 0;
  const hintLeft = horizDominant && drag.x < -HINT_FADE_IN_AT ? fade(drag.x) : 0;
  const hintUp = !horizDominant && drag.y < -HINT_FADE_IN_AT ? fade(drag.y) : 0;
  const hintDown = !horizDominant && drag.y > HINT_FADE_IN_AT ? fade(drag.y) : 0;

  const header = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-sm text-[10px] font-semibold uppercase tracking-[0.15em] transition-all duration-200 ${
                filter === f.key
                  ? 'bg-mute-amber text-mute-black'
                  : 'bg-white/[0.03] text-mute-muted border border-white/5 hover:border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
          className="px-3 py-1.5 text-mute-muted hover:text-white text-[10px] uppercase tracking-[0.15em] font-bold disabled:opacity-40 transition-colors"
          title="Refresca y revuelve la cola otra vez"
        >
          ↻ Recargar
        </button>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-mute-muted text-[11px] uppercase tracking-[0.2em]">
          <span className="text-white font-bold">{queue.length}</span> pendientes
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] uppercase tracking-[0.15em] text-mute-muted font-bold">
          <span>
            ← <span className="text-white">Skip</span>
          </span>
          <span>
            ↑ <span className="text-mute-amber">VIP</span>
          </span>
          <span>
            <span className="text-red-400">Borrar</span> →
          </span>
          <span>
            ↓ <span className="text-orange-400">Ban</span>
          </span>
        </div>
      </div>
    </>
  );

  if (loading) {
    return (
      <div className="relative w-full" style={{ minHeight: '70vh' }}>
        {header}
        <div className="text-center text-mute-muted py-20 text-sm uppercase tracking-[0.2em]">
          Cargando...
        </div>
      </div>
    );
  }

  if (!top) {
    return (
      <div className="relative w-full" style={{ minHeight: '70vh' }}>
        {header}
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-mute-muted text-sm uppercase tracking-[0.2em]">
            No quedan usuarios en este filtro.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ minHeight: '70vh' }}>
      {header}

      <div
        className="relative flex items-center justify-center"
        style={{ minHeight: '60vh' }}
      >
        {next && (
          <div
            className="absolute w-[300px] h-[440px] sm:w-[340px] sm:h-[480px] rounded-lg overflow-hidden bg-black border border-white/5 pointer-events-none"
            style={{ transform: 'scale(0.95)', opacity: 0.35 }}
          >
            <img
              src={photoUrl(next.id)}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}

        <div
          key={top.id}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute w-[300px] h-[440px] sm:w-[340px] sm:h-[480px] rounded-lg overflow-hidden bg-black border border-white/15 select-none cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rotation}deg)`,
            transition: drag.active
              ? 'none'
              : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s',
            opacity: cardOpacity,
            touchAction: 'none',
          }}
        >
          <img
            src={photoUrl(top.id)}
            alt={top.nombre}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.classList.add('bg-mute-black');
            }}
          />

          <div
            className="absolute bottom-0 left-0 right-0 p-5 pointer-events-none"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
            }}
          >
            <p className="text-white font-bold text-lg leading-tight">{top.nombre}</p>
            <p className="text-mute-muted text-xs mt-1">
              {top.telefono}
              {top.status === 'vip' && <span className="text-mute-amber ml-2">VIP</span>}
              {top.status === 'banned' && (
                <span className="text-red-400 ml-2">BANEADO</span>
              )}
              {top.valid_date && <span className="text-blue-400 ml-2">1 noche</span>}
            </p>
            <p className="text-mute-muted/70 text-[10px] mt-1">
              Registrado {new Date(top.created_at).toLocaleDateString('es-MX')}
            </p>
          </div>

          <div className="absolute inset-0 pointer-events-none">
            <span
              className="absolute text-red-500 text-5xl sm:text-6xl font-black tracking-tighter rotate-12"
              style={{ opacity: hintRight, right: '8%', top: '40%' }}
            >
              BORRAR
            </span>
            <span
              className="absolute text-white text-5xl sm:text-6xl font-black tracking-tighter -rotate-12"
              style={{ opacity: hintLeft, left: '8%', top: '40%' }}
            >
              SKIP
            </span>
            <span
              className="absolute text-mute-amber text-5xl sm:text-6xl font-black tracking-tighter left-1/2 -translate-x-1/2"
              style={{ opacity: hintUp, top: '8%' }}
            >
              VIP
            </span>
            <span
              className="absolute text-orange-400 text-5xl sm:text-6xl font-black tracking-tighter left-1/2 -translate-x-1/2"
              style={{ opacity: hintDown, bottom: '8%' }}
            >
              BAN
            </span>
          </div>
        </div>

        <div className="absolute -bottom-2 left-0 right-0 flex flex-wrap justify-center gap-2 sm:gap-3">
          <button
            onClick={() => commit('left')}
            disabled={!!busyId}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-mute-muted hover:text-white border border-white/10 rounded-sm text-[11px] uppercase tracking-[0.15em] font-bold transition-colors disabled:opacity-40"
          >
            ← Skip
          </button>
          <button
            onClick={() => commit('up')}
            disabled={!!busyId}
            className="px-4 py-2.5 bg-mute-amber/10 hover:bg-mute-amber/20 text-mute-amber border border-mute-amber/30 rounded-sm text-[11px] uppercase tracking-[0.15em] font-bold transition-colors disabled:opacity-40"
          >
            ↑ VIP
          </button>
          <button
            onClick={() => commit('down')}
            disabled={!!busyId}
            className="px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-sm text-[11px] uppercase tracking-[0.15em] font-bold transition-colors disabled:opacity-40"
          >
            ↓ Ban
          </button>
          <button
            onClick={() => commit('right')}
            disabled={!!busyId}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-sm text-[11px] uppercase tracking-[0.15em] font-bold transition-colors disabled:opacity-40"
          >
            Borrar →
          </button>
        </div>
      </div>
    </div>
  );
}
