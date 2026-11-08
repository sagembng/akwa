# Akwa Brand Identity System

## 1. Brand foundation

**Core philosophy:** Pure hydration delivered with total logistical reliability.

**Positioning:** Akwa is the clean, dependable water-station utility for people and places that need hydration to arrive without friction.

**Brand promise:** Every refill is easy to request, simple to track, and dependable when it arrives.

**Attributes:** Pure, dependable, effortless, modern, hygienic.

**Tone of voice:** Direct, reassuring, efficient, and clean. Use short sentences, plain verbs, and concrete status language. Prefer “Your refill is on the way” over “Hydration logistics are currently in transit.”

**Tagline:** Water, right when you need it.

**Messaging pillars:**
1. **Pure by default:** Clean visual language and clear hygiene signals.
2. **Reliable by design:** Statuses, schedules, and swaps are visible and predictable.
3. **Frictionless utility:** The product removes steps between need and refill.

## 2. Color system and accessibility

| Token | Hex | RGB | White contrast | Dark slate contrast | Primary use |
|---|---|---:|---:|---:|---|
| Deep Hydro Navy | `#0F3D56` | `15, 61, 86` | 11.52:1 AA | 1.55:1 | Headers, primary buttons, structure |
| Electric Cyan | `#21C7D9` | `33, 199, 217` | 2.05:1 fail | 8.70:1 AA | Active states, fluid accents, icons on navy |
| Ice Blue | `#BCEFF5` | `188, 239, 245` | 1.22:1 fail | 14.14:1 AA | Soft highlight surfaces, selected states |
| Pure Clean White | `#FFFFFF` | `255, 255, 255` | 1:1 | 17.85:1 AA | Main surface, reverse text |
| Cool Slate White | `#F4F8FA` | `244, 248, 250` | 1.06:1 | 18.70:1 AA | App background, cards |
| Deep Slate | `#0F172A` | `15, 23, 42` | 17.85:1 AA | 1:1 | Body text, labels |
| Muted Slate | `#526575` | `82, 101, 117` | 6.04:1 AA | 2.96:1 | Secondary text on white |
| Success | `#0F8A6A` | `15, 138, 106` | 4.32:1 AA | 4.14:1 | Delivered, safe, completed |
| Warning | `#A15C00` | `161, 92, 0` | 5.19:1 AA | 3.44:1 | Low stock, refill pending |
| Error | `#B42318` | `180, 35, 24` | 6.57:1 AA | 2.72:1 | Delayed, station closed |

**Contrast rule:** Use Electric Cyan and Ice Blue as accents, not as small text on white. For accessible primary actions, use Deep Hydro Navy with white text or Deep Hydro Navy with Electric Cyan text. Never communicate status by color alone; pair every state with a label or icon.

## 3. Typography system

**Display / headings:** Plus Jakarta Sans — geometric, open, and confident.

**Body / UI:** Inter — neutral, legible, and widely available.

| Element | Font | Size | Line height | Tracking | Weight |
|---|---|---:|---:|---:|---:|
| Display | Plus Jakarta Sans | 48px / 3rem | 1.08 / 52px | -0.04em | 700 |
| H1 | Plus Jakarta Sans | 36px / 2.25rem | 1.12 / 40px | -0.03em | 700 |
| H2 | Plus Jakarta Sans | 28px / 1.75rem | 1.18 / 33px | -0.025em | 700 |
| H3 | Plus Jakarta Sans | 22px / 1.375rem | 1.25 / 28px | -0.02em | 600 |
| Body-lg | Inter | 18px / 1.125rem | 1.55 / 28px | -0.01em | 400 |
| Body-sm | Inter | 14px / 0.875rem | 1.45 / 20px | 0 | 400 |
| Caption | Inter | 12px / 0.75rem | 1.35 / 16px | 0.02em | 500 |

**Google Fonts import:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
```

## 4. Logo system

- **App icon:** Use the standalone mark in square contexts from 32px upward. Keep the full rounded container; do not add a second border or shadow.
- **Horizontal lockup:** Use for navigation, splash screens, and headers. Preserve the 4:1 artboard ratio and leave clear space equal to the droplet width around the lockup.
- **Monochrome stamp:** Use only in black and white for thermal, physical, and one-color production. Do not recolor or add gradients.
- **Minimum size:** App icon 24px digital; wordmark 120px wide digital; stamp 18mm wide in print.
- **Do:** preserve proportions, use approved colors, and keep the mark legible.
- **Do not:** rotate, stretch, outline, bevel, add drop shadows, or place the color mark on low-contrast backgrounds.

## 5. Accessibility and handoff

Build to WCAG AA minimum: 4.5:1 for normal text, 3:1 for large text and non-text UI boundaries. Maintain visible `:focus-visible` states, 44px minimum touch targets, semantic labels, and `prefers-reduced-motion` fallbacks. Use the CSS token file as the source of truth and the Tailwind file as the utility mapping.
