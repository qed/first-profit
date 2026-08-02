/** @type {import('tailwindcss').Config} */
export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        paper: '#F7F2E8',
        parchment: '#FBF8F1',
        ink: '#1A1712',
        graphite: '#4A443A',
        clay: '#E4D9C4',
        ember: '#E0562A',
        ocean: '#2F5D8C',
        plum: '#6B4E8C',
        moss: '#2E7D53',
        gold: '#C98A16',
        go: '#1F9E4D',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        pod: '0 10px 0 rgba(26,23,18,0.12)',
        card: '0 2px 0 rgba(26,23,18,0.08)',
      },
    },
  },
  plugins: [],
}
