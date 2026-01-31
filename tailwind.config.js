/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                background: "#0E1116",
                surface: "#1C1F26", // Slightly lighter than background for cards
                surfaceHighlight: "#252932", // For hover or active states
                text: {
                    primary: "#F3F4F6",
                    secondary: "#9CA3AF",
                    muted: "#6B7280",
                },
                primary: {
                    DEFAULT: "#00E0A1", // Emerald accent from logo
                    dark: "#059669",
                    light: "#34D399",
                    blue: "#3B82F6", // Blue accent from logo
                },
                success: "#00E0A1",
                error: "#FF4D4D",
                warning: "#FBBF24",
                border: "#2A2E39",
            },
        },
    },
    plugins: [],
}
