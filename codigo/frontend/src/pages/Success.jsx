import { Link } from 'react-router-dom';

export default function Success() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-mute-amber/[0.06] blur-[120px] pointer-events-none" />

      <div className="relative z-10 animate-fade-in">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-mute-amber/40 flex items-center justify-center mb-6 mute-box-glow-strong mx-auto">
          <svg
            className="w-8 h-8 md:w-10 md:h-10 text-mute-amber"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl md:text-4xl font-black text-white mb-2">You're in.</h1>

        <div className="divider-mute w-10 mx-auto my-5" />

        <p className="text-lg md:text-2xl font-bold text-mute-amber mute-glow-sm mb-8">
          See you at MUTE.
        </p>

        <Link to="/" className="btn-mute-outline text-xs md:text-sm">
          Volver
        </Link>
      </div>

      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-[11px] text-mute-muted/50 tracking-[0.2em]">
          A project by{' '}
          <span className="text-mute-muted/70 font-semibold">humanhood.</span>
        </p>
      </div>
    </div>
  );
}
