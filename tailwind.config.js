/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'loading': 'loading 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'float-delayed': 'float-delayed 4s ease-in-out infinite 1s',
        'float-slow': 'float-slow 5s ease-in-out infinite 0.5s',
      },
      keyframes: {
        loading: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        float: {
          '0%, 100%': { 
            transform: 'translateY(0px)',
            opacity: '0.3'
          },
          '50%': { 
            transform: 'translateY(-20px)',
            opacity: '0.6'
          }
        },
        'float-delayed': {
          '0%, 100%': { 
            transform: 'translateY(0px)',
            opacity: '0.2'
          },
          '50%': { 
            transform: 'translateY(-15px)',
            opacity: '0.5'
          }
        },
        'float-slow': {
          '0%, 100%': { 
            transform: 'translateY(0px) scale(1)',
            opacity: '0.25'
          },
          '50%': { 
            transform: 'translateY(-25px) scale(1.1)',
            opacity: '0.6'
          }
        }
      }
    },
  },
  plugins: [],
}
