import type { Config } from "tailwindcss";

// LZB brand tokens, from the north-star prototype (Section 8 of the handoff).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#003349",
        navysoft: "#0d4a63",
        cream: "#E6E2D5",
        paper: "#faf8f2",
        ink: "#1d2733",
        muted: "#5f6b78",
        line: "#e2ddcf",
        rust: "#a8471f",
        grn: "#2e6b3e",
        chip: "#eee9da",
        redflag: "#b3261e",
        amber: "#9a6700",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Arial",
          "sans-serif",
        ],
      },
      maxWidth: { brief: "620px", dash: "760px" },
    },
  },
  plugins: [],
};
export default config;
