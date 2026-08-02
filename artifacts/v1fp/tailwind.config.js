export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        paper: '#FDFBF3',
        ink: '#1F2937',
        rule: '#DDD8C8',
        subtle: '#7C7768',
        tomato: '#E0603A',
        marker: '#F2C14E',
        mint: '#7FB29A',
        sky: '#6E9BC5',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        hand: ['Caveat', 'Comic Sans MS', 'cursive'],
      },
      boxShadow: {
        planner: '0 1px 0 #E7E2D2, 0 14px 30px -18px rgba(31,41,55,0.35)',
        sticker: '0 6px 14px -8px rgba(31,41,55,0.35)',
      },
    },
  },
  plugins: [],
};
