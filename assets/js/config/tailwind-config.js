tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#f0fdf4',
                    100: '#dcfce7',
                    200: '#bbf7d0',
                    300: '#86efac',
                    400: '#4ade80',
                    500: '#22c55e',
                    600: '#16a34a',
                    700: '#15803d',
                    800: '#166534',
                    900: '#14532d',
                    950: '#052e16',
                },
                accent: {
                    DEFAULT: '#FFC107',
                    hover: '#ffca28'
                },
                base: {
                    900: '#0f172a', /* deep navy/charcoal */
                    800: '#1e293b',
                    700: '#334155'
                }
            },
            fontFamily: {
                sans: ['Vazir', 'sans-serif'],
            }
        }
    }
}
