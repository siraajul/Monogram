# Part 11 — Testing

| Level | Tool | What | When |
|-------|------|------|------|
| Unit | Vitest | contract functions, conditions, pricing, fee splitter, layout | every PR |
| Snapshot | Vitest + Playwright + pixelmatch | layout() browser vs server; rendered PNGs | every PR touching layout/widget/worker |
| Integration | Vitest + test DB + Redis | publish flow, webhooks → render, proxy endpoints | every PR |
| E2E theme matrix | Playwright | storefront flows on real themes | nightly + before release |
| Load | k6 or autocannon | proxy endpoints, render queue | before public launch |

## Theme matrix (dev store, one theme per run)

Free: Dawn, Horizon (Ritual), Horizon (Heritage). Paid (buy dev copies or use partner access): 5 popular themes chosen by install share.

For each theme, run:
1. Add block + embed via theme editor (scripted with Admin API: write `templates/product.json` block and `settings_data.json` embed — VERIFY API allows this on dev stores; else set up manually once).
2. Product with each MVP option type → fill → add to cart → `/cart.js` contains every expected property.
3. Required field empty → add to cart blocked, error visible and focused.
4. Variant change → conditions and preview photo update.
5. Fee product: totals correct; remove product → fee removed on reload; checkout guard blocks orphan fee.
6. Quick add from collection page (if the theme has it).
7. Mobile viewport 360×800 run of steps 2–4.
8. Checkout (test gateway) → order has properties → files rendered within 5 minutes.

## Load targets

- `/apps/personalizer/designs`: p95 < 400 ms at 50 req/s.
- Render queue: 50 orders/minute sustained with `RENDER_CONCURRENCY=4` per worker; scale workers horizontally.

## Beta

1. Your own store (2 weeks).
2. 5–10 friendly stores with different themes and products (4 weeks). Track: setup time, support tickets, render failures, conversion on personalised products.
