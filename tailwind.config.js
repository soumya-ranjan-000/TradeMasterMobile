/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                background: "#0B0E11",
                surface: "#151921", // Slightly lighter than background for cards
                surfaceHighlight: "#1E222D", // For hover or active states
                text: {
                    primary: "#E1E7ED",
                    secondary: "#9CA3AF",
                    muted: "#6B7280",
                },
                primary: {
                    DEFAULT: "#2563eb", // Blue 600
                    dark: "#1d4ed8",
                    light: "#3b82f6",
                },
                success: "#10B981", // Emerald 500
                error: "#EF4444", // Red 500
                warning: "#F59E0B", // Amber 500
                border: "#2A2E39",
            },
        },
    },
    plugins: [],
}
