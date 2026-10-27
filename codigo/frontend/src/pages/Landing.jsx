import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-mute-amber/[0.04] blur-[150px] pointer-events-none" />

      <div className="relative z-10 text-center animate-fade-in">
        <img
          src="/mute-logo.png"
          alt="MUTE."
          className="h-20 md:h-44 mx-auto select-none"
          draggable={false}
        />

        <div className="divider-mute w-12 md:w-16 mx-auto mt-6 md:mt-8 mb-8 md:mb-10" />

        <Link
          to="/register"
          className="btn-mute rounded-full text-base md:text-xl px-10 md:px-12 py-3 md:py-4 inline-block"
        >
          Join Us
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
