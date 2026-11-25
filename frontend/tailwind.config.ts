import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f3f2ed",
        surface: "#fffefa",
        ink: "#202721",
        "ink-soft": "#414a42",
        muted: "#687269",
        line: "#dedfd6",
        sidebar: "#202722",
        accent: "#c8ed55",
        "accent-deep": "#586f1e",
        success: "#246641",
        warning: "#8b5a15",
        danger: "#a03931",
      },
      boxShadow: {
        card: "0 2px 3px rgb(34 42 32 / 3%), 0 12px 30px rgb(34 42 32 / 4%)",
      },
    },
  },
  plugins: [],
};

export default config;
