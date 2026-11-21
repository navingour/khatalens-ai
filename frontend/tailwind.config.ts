import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#0F766E", // Trustworthy Teal
          foreground: "#FFFFFF",
          hover: "#115E59",
        },
        secondary: {
          DEFAULT: "#F1F5F9",
          foreground: "#0F172A",
        },
        accent: {
          DEFAULT: "#F97316", // Saffron / Warning Accent
          foreground: "#FFFFFF",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "#10B981",
          foreground: "#FFFFFF",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
