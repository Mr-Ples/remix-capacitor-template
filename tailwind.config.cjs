module.exports = {
    content: [
        "./app/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#0A0A0F",
                backgroundAlt: "#12121A",
                foreground: "#FAFAFA",
                muted: "#1A1A24",
                mutedForeground: "#71717A",
                accent: "#F59E0B",
                accentForeground: "#0A0A0F",
                border: "rgba(255, 255, 255, 0.08)",
                borderHover: "rgba(255, 255, 255, 0.15)",
                card: "rgba(26, 26, 36, 0.6)",
                cardSolid: "#1A1A24",
            },
            fontFamily: {
                display: ["'Space Grotesk'", "system-ui", "sans-serif"],
                body: ["Inter", "system-ui", "sans-serif"],
                mono: ["'JetBrains Mono'", "monospace"],
            },
            borderRadius: {
                'lg': '0.75rem',
                'xl': '1rem',
                '2xl': '1.5rem',
            },
            boxShadow: {
                'glow-sm': '0 0 20px rgba(245, 158, 11, 0.15)',
                'glow-md': '0 0 40px rgba(245, 158, 11, 0.2)',
                'glow-lg': '0 0 60px rgba(245, 158, 11, 0.25)',
                'border-glow': '0 0 0 1px rgba(245, 158, 11, 0.3), 0 0 20px rgba(245, 158, 11, 0.15)',
            },
            backgroundImage: {
                'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Ffilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
            },
        }
    },
    plugins: [],
}
