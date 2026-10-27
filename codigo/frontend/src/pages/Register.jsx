import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Camera from '../components/Camera';
import { registerUser, verifyPhone } from '../api';

const PROCESSING_MESSAGES = [
  'Analizando tu rostro...',
  'Generando perfil biometrico...',
  'Verificando identidad...',
  'Registrando en el sistema...',
  'Casi listo...',
];

function ProcessingOverlay() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-mute-black/95 flex flex-col items-center justify-center px-6 animate-fade-in">
      <div className="text-center">
        <h1 className="text-2xl font-black text-mute-amber mute-glow-sm mb-8">MUTE.</h1>

        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="absolute inset-0 border-2 border-mute-amber/20 rounded-full" />
          <div className="absolute inset-0 border-2 border-transparent border-t-mute-amber rounded-full animate-spin" />
          <div
            className="absolute inset-2 border-2 border-transparent border-b-mute-amber/50 rounded-full animate-spin"
            style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
          />
        </div>

        <p className="text-white text-sm font-semibold mb-2">
          {PROCESSING_MESSAGES[msgIndex]}
          {dots}
        </p>
        <p className="text-mute-muted/40 text-[10px] uppercase tracking-[0.2em]">
          No cierres esta pagina
        </p>
      </div>
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pin, setPin] = useState('');
  const [foto, setFoto] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(null);
  const [verifierOpen, setVerifierOpen] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const handleVerify = async () => {
    const tel = verifyInput.trim();
    if (!tel) return;
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const r = await verifyPhone(tel);
      setVerifyResult(r.data);
    } catch {
      setVerifyResult({ error: true });
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!foto) {
      setError('Toma una selfie primero');
      return;
    }
    if (!pin) {
      setError('Ingresa tu PIN de invitacion');
      return;
    }
    if (!accepted) {
      setError('Acepta los terminos para continuar');
      return;
    }
    setLoading(true);
    setError(null);
    setAlreadyRegistered(null);
    try {
      await registerUser({ nombre, telefono, foto_base64: foto, pin });
      navigate('/success');
    } catch (err) {
      if (
        err.response?.status === 409 &&
        err.response?.data?.detail?.already_registered
      ) {
        setAlreadyRegistered(err.response.data.detail.nombre || 'tu');
      } else {
        const detail = err.response?.data?.detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : detail?.message || 'Error al registrar. Intenta de nuevo.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start md:justify-center px-5 py-6 md:py-12 relative">
      {loading && <ProcessingOverlay />}

      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-mute-amber/[0.03] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm md:max-w-md relative z-10 animate-slide-up pb-6">
        <Link
          to="/"
          className="text-mute-amber text-xl md:text-2xl font-black tracking-tight mute-glow-sm block text-center mb-1"
        >
          MUTE.
        </Link>
        <h2 className="text-center text-mute-muted text-[10px] md:text-xs uppercase tracking-[0.3em] mb-4 md:mb-6">
          Registro
        </h2>

        <div className="mb-5 md:mb-7">
          <button
            type="button"
            onClick={() => setVerifierOpen((o) => !o)}
            className="w-full text-left text-[11px] md:text-xs text-mute-muted hover:text-white uppercase tracking-[0.2em] py-2 border-b border-white/5 transition-colors"
          >
            ¿Ya te registraste antes?{' '}
            <span className="text-mute-amber">Verifica con tu telefono ›</span>
          </button>
          {verifierOpen && (
            <div className="mt-3 space-y-2 animate-fade-in">
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={verifyInput}
                  onChange={(e) => setVerifyInput(e.target.value)}
                  placeholder="Tu telefono"
                  className="input-mute flex-1"
                  autoComplete="tel"
                />
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifyBusy || !verifyInput.trim()}
                  className="px-4 py-2 bg-mute-amber/10 text-mute-amber border border-mute-amber/30 rounded-sm text-[11px] uppercase tracking-[0.15em] font-bold hover:bg-mute-amber/20 disabled:opacity-40"
                >
                  {verifyBusy ? '...' : 'Verificar'}
                </button>
              </div>
              {verifyResult && verifyResult.error && (
                <p className="text-red-400 text-xs">
                  No se pudo verificar. Intenta de nuevo.
                </p>
              )}
              {verifyResult && !verifyResult.error && verifyResult.registered && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-sm p-3 text-xs">
                  <p className="text-green-400 font-bold">✓ Ya estas registrado</p>
                  <p className="text-mute-muted mt-1">
                    Como{' '}
                    <span className="text-white font-semibold">
                      {verifyResult.nombre}
                    </span>
                    {verifyResult.status === 'vip' && (
                      <span className="text-mute-amber ml-2">VIP</span>
                    )}
                    {verifyResult.status === 'banned' && (
                      <span className="text-red-400 ml-2">acceso suspendido</span>
                    )}
                  </p>
                  <p className="text-mute-muted/70 mt-1.5 text-[10px]">
                    No necesitas registrarte otra vez.
                  </p>
                </div>
              )}
              {verifyResult && !verifyResult.error && !verifyResult.registered && (
                <p className="text-mute-muted text-xs">
                  No encontramos ese telefono. Continua con tu registro abajo.
                </p>
              )}
            </div>
          )}
        </div>

        {alreadyRegistered && (
          <div className="mb-5 bg-green-500/10 border border-green-500/30 rounded-sm p-4 animate-fade-in">
            <p className="text-green-400 font-bold text-sm">
              ✓ Ya estas registrado como {alreadyRegistered}
            </p>
            <p className="text-mute-muted text-xs mt-2">
              Tu PIN ya quedo registrado. Puedes pasar el dia del evento sin volver a
              registrarte.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          <div>
            <label className="block text-[10px] md:text-[11px] text-mute-muted mb-1.5 uppercase tracking-[0.2em]">
              PIN de invitacion
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              className="input-mute text-center text-xl md:text-2xl font-mono tracking-[0.4em]"
              placeholder="------"
            />
          </div>

          <div>
            <label className="block text-[10px] md:text-[11px] text-mute-muted mb-1.5 uppercase tracking-[0.2em]">
              Nombre
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              autoComplete="name"
              className="input-mute"
              placeholder="Tu nombre completo"
            />
          </div>

          <div>
            <label className="block text-[10px] md:text-[11px] text-mute-muted mb-1.5 uppercase tracking-[0.2em]">
              Telefono
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              required
              autoComplete="tel"
              className="input-mute"
              placeholder="+52 55 1234 5678"
            />
          </div>

          <div>
            <label className="block text-[10px] md:text-[11px] text-mute-muted mb-1.5 uppercase tracking-[0.2em]">
              Selfie
            </label>
            {!foto && (
              <div className="card-mute rounded-sm p-3 mb-3 border border-mute-amber/20">
                <div className="flex gap-2 items-start">
                  <span className="text-mute-amber text-sm mt-0.5">!</span>
                  <div className="text-[11px] text-mute-muted/80 leading-relaxed">
                    <p className="font-semibold text-mute-muted mb-1">
                      Para mejor reconocimiento:
                    </p>
                    <p>
                      Buena iluminacion, viendo directo a la camara, sin lentes de sol
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="relative">
              <div className={foto ? 'hidden' : ''}>
                <Camera onCapture={setFoto} showGuide />
              </div>
              {foto && (
                <div className="animate-fade-in">
                  <img
                    src={foto}
                    alt="Selfie"
                    className="w-full rounded-sm border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => setFoto(null)}
                    className="absolute top-3 right-3 bg-mute-black/80 text-mute-muted px-3 py-1 rounded-sm text-xs uppercase tracking-wider hover:text-white transition-colors"
                  >
                    Retomar
                  </button>
                </div>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded-sm accent-mute-amber flex-shrink-0"
            />
            <span className="text-mute-muted/60 text-[11px] leading-relaxed">
              Acepto los{' '}
              <a href="/terms" target="_blank" className="text-mute-muted/80 underline">
                terminos de uso
              </a>{' '}
              y el{' '}
              <a href="/privacy" target="_blank" className="text-mute-muted/80 underline">
                aviso de privacidad
              </a>
            </span>
          </label>

          {error && (
            <p className="text-red-400 text-xs text-center tracking-wide">{error}</p>
          )}

          {!loading && (
            <button type="submit" className="btn-mute w-full py-3 md:py-4 text-sm">
              Registrarme
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
