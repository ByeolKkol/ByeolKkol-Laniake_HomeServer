/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#0ea5e9',
        'app-text': 'var(--app-text)',
        'app-muted': 'var(--app-muted)',
        'app-border': 'var(--app-border)',
        'app-soft': 'var(--app-soft)',
        panel: 'var(--panel)',
        app: 'var(--app-bg)'
      },
      boxShadow: {
        panel: '0 20px 45px rgba(0, 0, 0, 0.25)'
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};
