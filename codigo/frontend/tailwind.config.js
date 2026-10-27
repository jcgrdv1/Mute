/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mute: {
          black: '#0a0a0f',
          dark: '#181820',
          gray: '#2a2a35',
          light: '#e0e0e0',
          muted: '#8a8a9a',
          amber: '#FFA500',
          'amber-light': '#FFB830',
          'amber-dark': '#CC8400',
        },
      },
      fontFamily: {
        display: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.5s ease-out',
        'slide-up': 'slide-up 0.5s ease-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { filter: 'brightness(1) blur(0px)' },
          '50%': { filter: 'brightness(1.1) blur(1px)' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'slide-up': {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
