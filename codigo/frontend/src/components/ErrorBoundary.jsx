import { Component } from 'react';

const RELOAD_KEY = 'mute_error_reloads';
const MAX_RELOADS = 3;
const RESET_AFTER_MS = 30000;

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, gaveUp: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[MUTE] App error:', error, info);

    const now = Date.now();
    let reloads = [];
    try {
      reloads = JSON.parse(sessionStorage.getItem(RELOAD_KEY) || '[]');
    } catch {}
    reloads = reloads.filter((t) => now - t < RESET_AFTER_MS);
    reloads.push(now);
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify(reloads));

    if (reloads.length >= MAX_RELOADS) {
      this.setState({ gaveUp: true });
      setTimeout(() => {
        sessionStorage.removeItem(RELOAD_KEY);
        window.location.reload();
      }, 60000);
    } else {
      setTimeout(() => window.location.reload(), 3000);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-mute-black text-center">
          <h1 className="text-2xl font-black text-mute-amber mute-glow-sm mb-4">MUTE.</h1>
          {this.state.gaveUp ? (
            <>
              <p className="text-mute-muted text-xs mb-2">
                Reintentando en 60 segundos...
              </p>
              <p className="text-mute-muted/40 text-[10px]">
                Si el problema persiste, reinicia la PC
              </p>
            </>
          ) : (
            <>
              <div className="w-8 h-8 border-2 border-mute-amber/30 border-t-mute-amber rounded-full animate-spin mx-auto mb-4" />
              <p className="text-mute-muted text-xs">Reiniciando...</p>
            </>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
