/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ontrail: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0',
          300: '#86efac', 400: '#4ade80', 500: '#22c55e',
          600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
        },
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem' },
      fontFamily: {
        sans: ['utile-narrow', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        'fade-in-out': {
          '0%': { opacity: '0', transform: 'translateX(-50%) translateY(4px)' },
          '10%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          '80%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
          '100%': { opacity: '0', transform: 'translateX(-50%) translateY(-4px)' },
        },
      },
      animation: {
        'fade-in-out': 'fade-in-out 3s ease-in-out forwards',
      },
    },
  },
  plugins: [],
};
