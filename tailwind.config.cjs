/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './privacy.html', './terms.html', './src/**/*.{ts,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Variable', 'Geist', 'system-ui', 'sans-serif'],
        display: ['Instrument Serif', 'Georgia', 'Times New Roman', 'serif'],
      },
      colors: {
        burgundy: {
          DEFAULT: '#8B2942',
          light: '#C44569',
        },
        /** Mint / cyan accent — reference primary */
        primary: {
          50: '#f0fffc',
          100: '#ccfff8',
          200: '#99fff1',
          300: '#66ffe9',
          400: '#9ffff2',
          500: '#5ee9dc',
          600: '#2ec4b6',
          700: '#1d9e93',
          800: '#177f76',
          900: '#145f59',
        },
        /** Lavender secondary accent */
        secondary: {
          50: '#faf8ff',
          100: '#f3edff',
          200: '#e8d9ff',
          300: '#d4bbff',
          400: '#c4a8f5',
          500: '#a67ee8',
          600: '#8b5fd4',
          700: '#6d46b3',
          800: '#5a3a94',
          900: '#3d2866',
        },
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0a1428',
          950: '#060e20',
        },
      },
    },
  },
  plugins: [],
};
