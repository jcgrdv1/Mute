import { useRef, useCallback, useState, useEffect } from 'react';

export default function Camera({
  onCapture,
  autoCapture = false,
  interval = 3000,
  sendWidth = 800,
  className = '',
  showGuide = false,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [permDenied, setPermDenied] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const faceCheckRef = useRef(null);

  const startCamera = useCallback(async () => {
    setError(null);
    setPermDenied(false);

    const constraints = [
      {
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ];

    for (let i = 0; i < constraints.length; i++) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('webkit-playsinline', 'true');
          await videoRef.current.play();
          setStreaming(true);
        }
        return stream;
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermDenied(true);
          setError('Necesitas permitir acceso a la camara para continuar');
          return null;
        }
        if (i < constraints.length - 1) continue;
        console.error('Camera error:', err.name, err.message);
        setError(
          `No se pudo acceder a la camara (${err.name}). Verifica los permisos en tu navegador.`,
        );
        return null;
      }
    }
  }, []);

  useEffect(() => {
    let stream = null;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled)
        startCamera().then((s) => {
          stream = s;
        });
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  useEffect(() => {
    if (!showGuide || !streaming || !videoRef.current) return;

    if (typeof window.FaceDetector === 'undefined') {
      setFaceDetected(true);
      return;
    }

    const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    faceCheckRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const faces = await detector.detect(videoRef.current);
        setFaceDetected(faces.length > 0);
      } catch {
        setFaceDetected(true);
      }
    }, 500);

    return () => clearInterval(faceCheckRef.current);
  }, [showGuide, streaming]);

  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !videoRef.current.videoWidth)
      return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    const scale = Math.min(1, sendWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    if (onCapture) onCapture(base64);
    return base64;
  }, [onCapture, sendWidth]);

  useEffect(() => {
    if (!autoCapture || !streaming) return;
    const id = setInterval(capture, interval);
    return () => clearInterval(id);
  }, [autoCapture, streaming, capture, interval]);

  if (error) {
    return (
      <div className="card-mute rounded-sm p-6 text-center space-y-4">
        <p className="text-red-400/80 text-sm">{error}</p>
        {permDenied && (
          <div className="space-y-3">
            <p className="text-mute-muted text-xs leading-relaxed">
              En iPhone: Configuracion &gt; Safari &gt; Camara &gt; Permitir
            </p>
            <button onClick={() => startCamera()} className="btn-mute py-3 px-6 text-xs">
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        webkit-playsinline="true"
        style={{ transform: 'scaleX(-1)' }}
        className={`w-full rounded-sm border border-white/10 ${className}`}
      />
      <canvas ref={canvasRef} className="hidden" />

      {showGuide && streaming && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className={`w-[55%] aspect-[3/4] rounded-full border-2 border-dashed transition-colors duration-300 ${
              faceDetected ? 'border-mute-amber/50' : 'border-white/20'
            }`}
          />
          <p
            className={`absolute bottom-3 left-0 right-0 text-center text-[11px] transition-colors duration-300 ${
              faceDetected ? 'text-mute-amber/70' : 'text-white/30'
            }`}
          >
            {faceDetected ? 'Rostro detectado' : 'Centra tu rostro'}
          </p>
        </div>
      )}

      {!autoCapture && streaming && (
        <button
          onClick={capture}
          className="btn-mute mt-3 w-full py-3 md:py-4 text-sm md:text-base"
        >
          Tomar Foto
        </button>
      )}
    </div>
  );
}
