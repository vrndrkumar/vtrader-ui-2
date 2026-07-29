/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── VTrader Brand: Amber Pro as primary ──────────────────────────────
        brand: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',   // Amber — light accent / dark-mode text
          500: '#FBBF24',   // Amber — primary action colour
          600: '#D97706',   // darker amber — button hover / active
          700: '#B45309',   // deep amber — light-mode active text
          800: '#92400E',
          900: '#78350F',
        },
        // ── VTrader extended palette ─────────────────────────────────────────
        vt: {
          navy:    '#0B1020',   // Deep Navy — main dark bg
          indigo:  '#121A2B',   // Indigo Blue — card/panel dark
          purple:  '#7C5CFF',   // Signal Purple — secondary accent / AI
          electric:'#00B5FF',   // Electric Blue — data highlights
          amber:   '#FFB020',   // Alert Amber — warnings
          coral:   '#FF4D4D',   // Coral Red — loss / danger
        },
        surface: {
          light:  '#ffffff',
          dark:   '#0B1020',    // VTrader Deep Navy
        },
        card: {
          light: '#f8fafc',
          dark:  '#121A2B',     // VTrader Indigo Blue
        },
        border: {
          light: '#e2e8f0',
          dark:  '#1E2A3F',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Exo 2"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
