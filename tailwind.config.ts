import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f8ff",
          100: "#e7efff",
          500: "#5b7cfa",
          600: "#4b66d8",
          700: "#3a51b3",
        },
        trust: {
          good: "#2f9e6b",
          mid: "#d4a017",
          bad: "#c0504d",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
