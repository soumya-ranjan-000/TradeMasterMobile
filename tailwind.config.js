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
                    secondary: "#A9B0BC",
                    muted: "#8B93A1", // ≥4.5:1 on surface (was #6B7280, 3.3:1)
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
                // How a position is held: never red/green, which mean P&L and side.
                intraday: "#60A5FA", // MIS, squared off at 15:25
                swing: "#C084FC",    // CNC (delivery), held overnight
                border: "#2A2E39",
            },
        },
    },
    plugins: [],
}
