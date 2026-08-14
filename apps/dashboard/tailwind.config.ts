import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        foreground: '#ffffff',
        muted: '#888888',
        border: '#222222',
        'border-hover': '#444444',
        surface: '#111111',
        'surface-hover': '#1a1a1a',
        accent: '#ffffff',
        'status-green': '#22c55e',
        'status-yellow': '#eab308',
        'status-red': '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
