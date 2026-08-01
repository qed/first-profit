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
        ink: 'hsl(30 12% 12%)',
        graphite: '#4A443A',
        clay: '#E4D9C4',
        ember: '#E0562A',
        ocean: '#2F5D8C',
        plum: '#6B4E8C',
        moss: '#2E7D53',
        gold: '#C98A16',
        go: '#1F9E4D',
        // fpv2 design tokens (design_handoff_v1_user_flow README §Design Tokens)
        sell: 'hsl(14 78% 54%)',
        build: 'hsl(217 74% 56%)',
        validate: 'hsl(265 52% 58%)',
        grow: 'hsl(150 52% 42%)',
        scale: 'hsl(41 88% 52%)',
        wax: 'hsl(4 62% 46%)',
        goldleaf: 'hsl(41 74% 50%)',
        verified: 'hsl(150 52% 40%)',
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Spline Sans Mono"', 'ui-monospace', 'monospace'],
        hand: ['Caveat', 'cursive'],
      },
      boxShadow: {
        pod: '0 10px 0 rgba(26,23,18,0.12)',
        card: '0 2px 0 rgba(26,23,18,0.08)',
      },
    },
  },
  plugins: [],
}
