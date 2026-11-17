# Part 01 — Project setup

Goal: a running embedded Shopify app on a development store, with a database, a worker process, a shared package, and CI.

## 1. Stack (do not substitute without asking)

| Layer | Choice |
|-------|--------|
| App framework | Shopify app template (React Router), TypeScript |
| Admin UI | Polaris (web components or React, whichever the template ships) + App Bridge |
| DB | PostgreSQL 15+ via Prisma |
| Queue | BullMQ + Redis |
| Storefront widget | Preact + TypeScript, bundled with esbuild into the theme app extension `assets/` |
| Canvas (browser) | Konva (MVP preview). Fabric.js only for the v2 template editor in admin |
| Render (server) | @napi-rs/canvas, opentype.js, resvg-js, pdf-lib, sharp |
| Storage | S3-compatible (Cloudflare R2 or AWS S3) via `@aws-sdk/client-s3` + presigned URLs |
| Validation | zod |
| Tests | Vitest (unit), Playwright (e2e/theme matrix) |
| Lint/format | ESLint + Prettier |
| Monitoring | Sentry (server + storefront) |

## 2. Repository layout (monorepo, npm or pnpm workspaces)

```
personalizer/
├─ app/                       # Shopify app (React Router) — admin + API routes
│  ├─ routes/
│  ├─ models/                 # DB access functions
│  ├─ services/               # shopify, storage, billing, publishing
│  └─ shopify.server.ts
├─ extensions/
│  ├─ personalizer-theme/     # theme app extension (app block + app embed)
│  │  ├─ blocks/personalizer.liquid
│  │  ├─ blocks/personalizer-embed.liquid
│  │  ├─ assets/              # built widget JS/CSS (output of packages/widget)
│  │  └─ locales/en.default.json
│  ├─ order-block/            # admin UI extension on the order page (v2)
│  └─ fee-guard/              # cart & checkout validation function
├─ packages/
│  ├─ contract/               # shared TS types + zod schemas (Part 03)
│  ├─ layout/                 # shared layout engine (Part 06) — runs in browser AND node
│  └─ widget/                 # storefront Preact source (Part 05) → builds into extensions/personalizer-theme/assets
├─ worker/                    # BullMQ render worker (Part 08)
├─ prisma/schema.prisma
├─ docs/decisions.md
├─ docs/changelog.md
└─ spec/                      # these markdown files
```

## 3. Commands

```bash
# create app (choose the React Router template, TypeScript)
npm init @shopify/app@latest

# generate extensions
shopify app generate extension --template theme_app_extension --name personalizer-theme
shopify app generate extension --template cart_checkout_validation --name fee-guard   # VERIFY template name
shopify app generate extension --template admin_block --name order-block              # v2, VERIFY

# dev
shopify app dev
```

Add workspace packages `packages/contract`, `packages/layout`, `packages/widget`, and `worker/`.

## 4. `shopify.app.toml` essentials (VERIFY field names against current docs)

```toml
[access_scopes]
scopes = "read_products,write_products,read_orders,write_files,read_themes"
# add write_cart_transforms only if Part 07 option B is built

[app_proxy]
url = "https://<your-app-host>/proxy"
prefix = "apps"
subpath = "personalizer"

[webhooks]
api_version = "2026-01"   # use the latest stable version at build time

  [[webhooks.subscriptions]]
  topics = ["orders/create", "orders/updated", "orders/cancelled", "refunds/create",
            "products/update", "products/delete", "app/uninstalled"]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
  uri = "/webhooks/compliance"
```

## 5. Environment variables

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=
DATABASE_URL=postgres://...
REDIS_URL=redis://...
S3_ENDPOINT=            # R2: https://<account>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=personalizer
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
CDN_BASE_URL=           # public URL for assets, previews
SENTRY_DSN=
RENDER_CONCURRENCY=4
```

## 6. Processes

| Process | Command | Notes |
|---------|---------|-------|
| web | React Router server | admin, API, proxy, webhooks |
| worker | `node worker/dist/index.js` | consumes `render` and `publish` queues |
| widget build | `npm -w packages/widget run build -- --watch` | writes to `extensions/personalizer-theme/assets/` |

## 7. CI (GitHub Actions)

- On PR: install, typecheck, lint, unit tests, widget bundle-size check (fail if `personalizer.js` > 60 KB gzipped).
- On main: also run Playwright smoke test against a dev store (secrets in repo settings).

## Tasks

1. Scaffold the app with the React Router template; confirm `shopify app dev` installs it on a dev store.
2. Convert to workspaces; create empty `packages/contract`, `packages/layout`, `packages/widget`, `worker`.
3. Add Prisma + Postgres; add Redis + BullMQ with a `ping` job that logs.
4. Generate the theme app extension; make the widget build write `personalizer.js` and `personalizer.css` into its `assets/`.
5. Add the app proxy route `/proxy/health` returning `{ ok: true, shop }` after verifying the proxy signature (template helper `authenticate.public.appProxy`, VERIFY).
6. Add CI.

## Acceptance checks

- [ ] App installs on a dev store and opens inside Shopify admin.
- [ ] `https://<store>/apps/personalizer/health` returns `{ ok: true, shop: "<store>.myshopify.com" }`.
- [ ] Worker logs the `ping` job.
- [ ] Theme editor shows the app block "Personalizer" and app embed "Personalizer core".
- [ ] CI passes on an empty PR.
