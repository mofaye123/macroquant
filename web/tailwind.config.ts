import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--bg)",
          card: "var(--card)",
          border: "var(--border)",
          text: "var(--text)",
          muted: "var(--muted)",
          success: "var(--success)",
          warning: "var(--warning)",
          danger: "var(--danger)",
          accent: "var(--accent)"
        }
      },
      boxShadow: {
        card: "0 24px 56px -38px rgba(15, 23, 42, 0.35)",
        soft: "0 16px 30px -25px rgba(15, 23, 42, 0.25)"
      }
    }
  },
  plugins: []
};

export default config;
