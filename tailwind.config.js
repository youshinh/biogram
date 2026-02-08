/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'deep-void': '#0a0a0c',
        'glass-surface': 'rgba(0, 0, 0, 0.2)',
        'signal-emerald': '#10b981',
        'tech-cyan': 'hsl(200, 80%, 60%)',
        'zinc-300': '#d4d4d8',
        'zinc-500': '#71717a',
        'zinc-700': '#3f3f46',
        'zinc-800': '#27272a',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      letterSpacing: {
        'widest-xl': '0.3em',
      },
      boxShadow: {
        'glass': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'glow': '0 0 30px rgba(16, 185, 129, 0.5)',
      },
      animation: {
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
