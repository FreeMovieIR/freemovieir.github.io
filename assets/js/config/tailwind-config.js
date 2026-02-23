tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#020617',
                },
                accent: {
                    DEFAULT: '#f59e0b', // Amber/Gold for cinematic feel
                    hover: '#d97706',
                    glow: 'rgba(245, 158, 11, 0.4)'
                },
                base: {
                    950: '#07090f', // Near black
                    900: '#0f172a', /* deep navy */
                    800: '#1e293b',
                    700: '#334155'
                }
            },
            fontFamily: {
                sans: ['Vazir', 'sans-serif'],
            },
            boxShadow: {
                'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
                'accent-glow': '0 0 15px rgba(245, 158, 11, 0.3)',
            },
            backdropBlur: {
                xs: '2px',
            }
        }
    }
}
