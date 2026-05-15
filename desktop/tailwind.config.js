/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#09090b',
          secondary: '#121215',
          tertiary: '#18181b',
        },
        accent: {
          gold: '#c8962e',
          goldHover: '#e5b34c',
          goldMuted: 'rgba(200, 150, 46, 0.1)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
