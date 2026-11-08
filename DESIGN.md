# Akwa design notes

The brand kit in `Branding/akwa-brand-kit` is the source of truth. `src/styles/tokens.css` is an unchanged copy of its token file. This note records how the app applies it.

**Scene:** a customer at home or at a front desk, in daylight, usually on a phone, who noticed the jug is low. That makes this a light, fast, task-first interface.

**Color:** Cool Slate White ground and white panels, with Deep Hydro Navy owning the hero and confirmation. Electric Cyan appears as water and as text or icons on navy only. Ice Blue tints appear on selected states.

**Type:** Plus Jakarta Sans 600/700 for headings and key figures, Inter 400/500 for UI, at the kit's sizes. Only the weights the kit loads are used.

**Motion:** water is the one idea. The level rises on arrival, jugs fill as they are added, the progress pipe fills, and the confirmation panel fills up. Everything else is quick feedback.
- UI ease `cubic-bezier(.2,.8,.2,1)`, entrance ease `cubic-bezier(.22,1,.36,1)`
- 90 to 150ms for feedback, 200 to 300ms for state changes, up to 1000ms for the confirmation fill
- Exits are faster than entrances
- Under `prefers-reduced-motion`, everything becomes a short fade and state still changes

**Layout:** phone below 768px, tablet from 768px to 1023px, desktop from 1024px. Phones get a fixed action bar in the order flow and scrolling day and filter strips. Tablets keep the order summary beside the form. Admin order rows go from four columns on desktop to two on tablet and one on phone.

**Locale:** pesos, 12-hour times, month-first dates and Metro Manila places. Orders are counted in gallons.

## Where the app is stricter than the kit

- **Focus rings:** the kit's preview uses cyan, which is 2.05:1 on white. Light surfaces use a navy ring and navy surfaces a cyan one.
- **Success color:** `#0F8A6A` is 4.32:1 on white. The kit labels it AA, but normal text needs 4.5:1. It colors icons only, and the label stays Deep Slate.
- **Kicker labels:** the kit's preview uses small uppercase labels above headings. The app leaves them out and lets headings speak.
