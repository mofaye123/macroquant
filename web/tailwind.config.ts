import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', "serif"],
        body: ['Merriweather', "serif"],
        sans: ['Inter', "sans-serif"],
        mono: ['"Roboto Mono"', "monospace"]
      },
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
          accent: "var(--accent)",
          rule: "var(--rule)",
          navy: "var(--navy)",
          burgundy: "var(--burgundy)",
          slate: "var(--slate)",
          mist: "var(--mist)",
          paper: "var(--paper)",
          paperSoft: "var(--paper-soft)",
          surface: "var(--surface)",
          surfaceStrong: "var(--surface-strong)"
        }
      },
      boxShadow: {
        card: "0 18px 42px -32px rgba(26, 26, 26, 0.36)",
        soft: "0 12px 24px -20px rgba(26, 26, 26, 0.24)"
      }
    }
  },
  plugins: []
};

export default config;
