/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: '#22221f',
        paper: '#f8f7f2',
        panel: '#ffffff',
        line: '#d9d4c8',
        moss: '#4f6f52',
        teal: '#27746d',
        plum: '#6d4a7c',
        amber: '#b56b25',
        rust: '#ad3e2e',
      },
      boxShadow: {
        soft: '0 18px 50px rgba(34, 34, 31, 0.12)',
      },
    },
  },
  plugins: [],
};

