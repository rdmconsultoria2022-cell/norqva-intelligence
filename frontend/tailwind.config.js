/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'media', // Respect prefers-color-scheme
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // NORQVA-0082 (proposta): tokens do Design System NORQVA Premium. Contraste conferido (WCAG AA):
      // texto secundário 6,7:1 sobre surface; vermelho de texto = critical-text (o #EF4444 só em ícones e barras);
      // botão verde usa texto escuro (branco sobre verde dá 2,5:1).
      colors: {
        nq: {
          bg: '#101010',
          surface: '#1D1D1D',
          raised: '#252525',
          line: '#343434',
          text: '#F5F5F5',
          muted: '#A3A3A3',
          subtle: '#8A8A8A',
          positive: '#10B981',
          'positive-text': '#34D399',
          info: '#60A5FA',
          attention: '#EAB308',
          critical: '#EF4444',
          'critical-text': '#F87171',
          'on-positive': '#0A0A0A'
        },
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981', // Emerald 500
          600: '#059669',
          900: '#064e3b',
        },
      },
      fontSize: {
        // escala do Design System NORQVA Premium (mínimo 12 px)
        'nq-caption': ['12px', { lineHeight: '16px' }],
        'nq-aux': ['13px', { lineHeight: '18px' }],
        'nq-body': ['15px', { lineHeight: '22px' }],
        'nq-section': ['20px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
        'nq-title': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
        'nq-hero': ['36px', { lineHeight: '42px', letterSpacing: '-0.025em' }]
      },
      borderRadius: {
        nq: '16px'
      },
    },
  },
  plugins: [],
}
