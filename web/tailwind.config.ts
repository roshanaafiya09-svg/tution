import type { Config } from "tailwindcss";
import fs from "node:fs";
import path from "node:path";
import animate from "tailwindcss-animate";

// Single source of truth: shared/design-tokens/tokens.json (see docs/design-system.md).
// Read via fs instead of `import ... .json` so it resolves the same way
// regardless of which loader Tailwind uses to evaluate this config.
// This path deliberately lives outside web/ (mobile/ reads the same
// file) — Turbopack's project-root sandboxing refuses to resolve a
// fs path that "leaves the filesystem root" here, so package.json's
// dev/build scripts pass --webpack (Next 16 still ships webpack as an
// explicit opt-out for exactly this case; see next.config.mjs).
const tokens = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../shared/design-tokens/tokens.json"),
    "utf-8",
  ),
) as {
  color: {
    brand: Record<string, string>;
    accent: Record<string, string>;
    neutral: Record<string, string>;
    semantic: Record<string, { DEFAULT: string; bg: string; dark: string }>;
  };
  typography: { fontFamily: { display: string[]; sans: string[] } };
  radius: Record<string, string>;
  shadow: Record<string, string>;
};

const config: Config = {
  darkMode: "media",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: tokens.color.brand,
        accent: tokens.color.accent,
        neutral: tokens.color.neutral,
        success: tokens.color.semantic.success,
        warning: tokens.color.semantic.warning,
        error: tokens.color.semantic.error,
        info: tokens.color.semantic.info,
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
      },
      fontFamily: {
        display: tokens.typography.fontFamily.display,
        sans: tokens.typography.fontFamily.sans,
      },
      borderRadius: {
        sm: tokens.radius.sm,
        md: tokens.radius.md,
        lg: tokens.radius.lg,
        xl: tokens.radius.xl,
        "2xl": tokens.radius["2xl"],
      },
      boxShadow: {
        xs: tokens.shadow.xs,
        sm: tokens.shadow.sm,
        md: tokens.shadow.md,
        lg: tokens.shadow.lg,
        "focus-ring": tokens.shadow["focus-ring"],
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out backwards",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};
export default config;
