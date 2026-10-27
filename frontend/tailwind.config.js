/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Reference palette (light government-analytics portal)
        brand: { DEFAULT: '#1F5FE0', hover: '#194DB8', dark: '#0B3FA8' },
        navy: '#0F2A4A',
        bg: '#F3F6FB',
        card: '#FFFFFF',
        softblue: '#E8F0FE',
        bord: '#E3E8F0',
        txt: '#0F2A4A',
        txt2: '#64748B',
        pos: '#16A34A',
        neg: '#DC2626',
        warn: '#D97706',
        accent: '#0EA5A4',
        amber: '#F59E0B',
        slate: '#64748B',
        // legacy aliases so older page markup keeps resolving
        app: '#F3F6FB',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      borderRadius: { card: '12px' },
      boxShadow: {
        card: '0 1px 2px rgba(15,42,74,0.04), 0 1px 3px rgba(15,42,74,0.06)',
        'card-hover': '0 4px 16px rgba(15,42,74,0.10)',
      },
    },
  },
  plugins: [],
}
