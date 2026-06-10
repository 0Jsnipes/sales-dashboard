import daisyui from "daisyui";

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
        ],
        display: ["Sora", "Plus Jakarta Sans", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [{
      abtheme: {
        primary: "#101010",
        secondary: "#D4E157",
        accent: "#1f1f1f",
        neutral: "#0b0b0b",
        "base-100": "#ffffff",
        info: "#2563eb",
        success: "#16a34a",
        warning: "#f59e0b",
        error: "#dc2626",
      },
    }],
  },
};
