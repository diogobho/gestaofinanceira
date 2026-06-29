/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cor primária = Navy oficial DuoFuturo (#13264C). "Navy domina, dourado pontua."
        primary: {
          50:  '#eef1f7',
          100: '#d5dcea',
          200: '#aebcd4',
          300: '#8094ba',
          400: '#57709c',
          500: '#3a5483',
          600: '#243a65',
          700: '#13264C',
          800: '#0d1a36',
          900: '#081027',
          950: '#050a1a',
        },
        // Dourado oficial (destaque/CTA, usar com parcimônia)
        gold: {
          DEFAULT: '#D2B773',
          light:   '#e8c98a',
          dark:    '#b8944f',
          50:  '#faf6ec',
          100: '#f3e9cf',
          200: '#e8d3a0',
          300: '#dcbd72',
          400: '#D2B773',
          500: '#c2a052',
          600: '#b8944f',
          700: '#936f3c',
          800: '#6e5330',
          900: '#4a3820',
        },
        cream: {
          DEFAULT: '#E5DDD1',
          dark:    '#d8cfc2',
        },
        brand: {
          navy: '#13264C',
          orange: '#ff9800',
          lightOrange: '#ffb74d',
          darkNavy: '#0d1a36',
        },
        // Landing page premium palette (hex oficiais da marca)
        lp: {
          navy:  '#13264C',
          navyD: '#0d1a36',
          navyL: '#243a65',
          gold:  '#D2B773',
          goldL: '#e8c98a',
          goldD: '#b8944f',
          cream: '#E5DDD1',
          creamD: '#d8cfc2',
        },
      },
      fontFamily: {
        display: ['"The Seasons"', 'Cormorant Garamond', 'Georgia', 'serif'],
        sans:    ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #D2B773, #e8c98a, #b8944f)',
        'navy-gradient': 'linear-gradient(135deg, #243a65, #13264C, #0d1a36)',
      },
    },
  },
  plugins: [],
}
