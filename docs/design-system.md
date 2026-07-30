# Design System — "Scholar"

Source of truth: [`shared/design-tokens/tokens.json`](../shared/design-tokens/tokens.json). Every platform (web Tailwind config, Flutter `ThemeData`) reads from these values — never fork a color or font size locally.

## Why this direction

Most ed-tech products default to generic SaaS blue-on-white. Tuition App is sold to individual tutors running a real teaching business — the product should feel like a premium, trustworthy academic tool, not a generic dashboard template. Two decisions drive that:

1. **Deep indigo + marigold amber**, not flat SaaS blue. Indigo reads as academic/trustworthy; marigold is a deliberate, culturally warm accent for a Chennai/Tamil Nadu launch market (marigold garlands are a common motif at Indian schools and functions) — it's used sparingly, for CTAs and highlights only, never as a background flood.
2. **Editorial serif (Fraunces) for display/marketing, humanist sans (Inter) for product UI.** The serif gives public tutor profile pages and the landing page an "academic prestige" feel on first impression; the sans keeps dense in-product screens (attendance grids, fee ledgers) legible and fast to scan. This split is intentional — never use Fraunces in dense data UI, never use Inter for a hero headline on the public site.

Bilingual support (English + Tamil) is not an afterthought: both font stacks fall back to Noto Sans/Serif Tamil so Tamil-script text renders with matching weight and rhythm instead of a mismatched system fallback.

## Color

| Token | Hex | Use |
|---|---|---|
| `brand.600` | `#3532A8` | Primary actions, links, active nav |
| `brand.900` | `#1A1852` | Dark surfaces, headers on dark |
| `accent.500` | `#F59A0C` | Primary CTA buttons, highlights, badges — used sparingly |
| `neutral.50`–`950` | warm off-white → near-black | Backgrounds, text, borders. Warm-tinted (not cold slate) for an approachable, paper-like feel |
| `semantic.success/warning/error/info` | — | Status only (attendance, payment status, verification state) — never decorative |

## Typography

- **Display** (`Fraunces`): marketing/public pages, section headers, tutor profile hero. Sizes `display-md` → `display-2xl`.
- **Sans** (`Inter`): everything else — forms, tables, nav, buttons, body copy. Sizes `h1`–`caption`.

## Shape & elevation

- Cards/panels: `radius.lg` (1rem) as the default; `radius.2xl` for hero/marketing cards.
- Buttons/inputs: `radius.md`.
- Shadows are soft and warm-tinted (`rgb(20 18 14 / …)`, not pure black) — see `shadow.sm`/`md`/`lg` in tokens.

## Motion

Two speeds only: `fast` (120ms, micro-interactions like hover/press) and `base` (200ms, panel/menu transitions). Standard easing `cubic-bezier(0.4,0,0.2,1)`. No motion is load-bearing — every transition must be skippable/instant under `prefers-reduced-motion`.

## Platform wiring

- **Web (Tailwind)**: `web/tailwind.config.ts` extends `theme.colors`, `theme.fontFamily`, `theme.borderRadius`, `theme.boxShadow` from `shared/design-tokens/tokens.json`.
- **Mobile (Flutter)**: `mobile/lib/design_system/theme.dart` (created once the Flutter app is scaffolded) mirrors the same values into a `ThemeData`/`ColorScheme`.
