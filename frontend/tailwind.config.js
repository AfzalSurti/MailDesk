/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#F0EEEA",
        card: "#FAFAF8",
        sidebar: "#2C2825",
        accent: "#8B7355",
        "accent-hover": "#6F5A44",
        border: "#DDD8D0",
        muted: "#78716C",
        ink: "#1C1917",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
