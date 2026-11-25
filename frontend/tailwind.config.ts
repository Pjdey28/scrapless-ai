import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17212b",
        navy: "#142536",
        steel: "#687781",
        line: "#e1e7e9",
        surface: "#f5f7f7",
        forest: "#187653",
        mint: "#e7f4ed",
        amber: "#9b6b18",
      },
      boxShadow: {
        card: "0 2px 10px rgba(21, 42, 55, 0.045)",
      },
    },
  },
  plugins: [],
};

export default config;
