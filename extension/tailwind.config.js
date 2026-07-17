/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts,js}'],
  theme: {
    extend: {
      colors: {
        bg: '#080a0d',
        card: '#1b2028',
        'text-primary': '#f2f5f8',
        muted: '#8b95a5',
        faint: '#555f70',
        blue: '#5b8def',
        'line-soft': '#1f252e',
      },
    },
  },
  plugins: [],
};
