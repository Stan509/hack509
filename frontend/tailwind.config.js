/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'neon-green': '#00ff66',
        'neon-dim': '#00cc44',
        'neon-warn': '#ff9900',
        'neon-danger': '#ff2244',
        'bg-primary': '#050505',
        'bg-card': '#0d0d0d',
        'bg-secondary': '#111111',
        'text-terminal': '#e0ffe0',
        'text-muted': '#3d5a3d',
        'border-neon': '#00ff6633',
      },
      fontFamily: {
        mono: ['Fira Code', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'neon': '0 0 10px #00ff66, 0 0 20px #00ff66, 0 0 40px #00ff6633',
        'neon-sm': '0 0 5px #00ff66, 0 0 10px #00ff6644',
        'neon-warn': '0 0 10px #ff9900, 0 0 20px #ff990044',
        'neon-danger': '0 0 10px #ff2244, 0 0 20px #ff224444',
        'card': '0 0 20px #00ff6611, inset 0 0 20px #00000066',
      },
      animation: {
        'pulse-neon': 'pulse-neon 2s ease-in-out infinite',
        'matrix-fall': 'matrix-fall 0.5s linear infinite',
        'typing': 'typing 1s step-end infinite',
        'scan': 'scan 3s linear infinite',
        'flicker': 'flicker 0.15s infinite linear',
        'glow-pulse': 'glow-pulse 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-neon': {
          '0%, 100%': { boxShadow: '0 0 5px #00ff66, 0 0 10px #00ff66' },
          '50%': { boxShadow: '0 0 20px #00ff66, 0 0 40px #00ff66, 0 0 60px #00ff6644' },
        },
        'typing': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'glow-pulse': {
          '0%, 100%': { textShadow: '0 0 5px #00ff66' },
          '50%': { textShadow: '0 0 20px #00ff66, 0 0 40px #00ff66' },
        },
        'flicker': {
          '0%': { opacity: '0.97' },
          '5%': { opacity: '0.93' },
          '10%': { opacity: '0.97' },
          '15%': { opacity: '0.95' },
          '25%': { opacity: '0.97' },
          '30%': { opacity: '0.94' },
          '35%': { opacity: '0.97' },
          '75%': { opacity: '0.96' },
          '80%': { opacity: '0.97' },
          '90%': { opacity: '0.95' },
          '95%': { opacity: '0.97' },
        }
      }
    },
  },
  plugins: [],
}
