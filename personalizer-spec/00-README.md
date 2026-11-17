# Product Personalizer App — Build Spec for a Coding Agent

A Shopify app with the same capabilities as Zepto Product Personalizer (form options + price add-ons) and Customily (live preview + print-ready files). **Original implementation**: do not copy either app's code, UI text, icons, fonts or templates.

## How to use these files with your coding agent

Give the agent **one part at a time, in order**. Each part is self-contained and ends with tasks and acceptance checks. Do not start a part until the previous part's checks pass.

| # | File | What the agent builds | Phase |
|---|------|------------------------|-------|
| 00 | `00-README.md` | Nothing — read first | — |
| 01 | `01-project-setup.md` | Repo, Shopify app template, tooling, CI | MVP |
| 02 | `02-data-model.md` | Prisma schema, migrations, seed data | MVP |
| 03 | `03-config-contract.md` | Shared TypeScript types + validation (the JSON every part uses) | MVP |
| 04 | `04-admin-app.md` | Merchant admin screens | MVP / v2 |
| 05 | `05-storefront-widget.md` | Theme app extension, option form, cart integration | MVP |
| 06 | `06-preview-engine.md` | Shared layout package + live canvas preview | MVP / v2 |
| 07 | `07-pricing-addons.md` | Add-on fee product, cart guard, optional Cart Transform | MVP |
| 08 | `08-orders-rendering.md` | Webhooks, render worker, print files | MVP / v2 |
| 09 | `09-api-reference.md` | Every endpoint and webhook with request/response shapes | Reference |
| 10 | `10-billing-security-appstore.md` | Billing, security, privacy, App Store checklist | v3 |
| 11 | `11-testing.md` | Unit, snapshot, theme-matrix, load tests | All |
| 12 | `12-roadmap-tasks.md` | Ordered task list with prompts to paste into the agent | All |

## Standing instructions for the agent (paste once at the start)

```text
You are building a Shopify app called "Personalizer" (working name).
Rules:
- TypeScript everywhere, strict mode. No `any` unless commented why.
- Follow the files in /spec in numeric order. The spec wins over your assumptions.
- When a Shopify API detail in the spec is marked VERIFY, check the current
  shopify.dev docs before coding it, and note what you found in /docs/decisions.md.
- Never edit theme files. Storefront code ships only as a theme app extension.
- Every task ends with: code, tests, and a short note in /docs/changelog.md.
- Do not copy code, text or assets from other personalizer apps.
- Keep the storefront bundle under 60 KB gzipped (before the canvas library).
- Ask before adding a dependency not listed in 01-project-setup.md.
```

## Glossary

| Term | Meaning |
|------|---------|
| Option set | A group of options (fields) reused across products |
| Option | One field: text, dropdown, swatch, clipart picker, upload, slot builder… |
| Option value | One choice inside a dropdown/swatch/clipart option |
| Condition | Rule that shows/hides an option or value based on other answers |
| Price rule | Extra charge tied to an option (fixed, per character, per slot, per file) |
| Template | Designer edition: a canvas with views, print areas and layers |
| Print area | A rectangle (or shape) on a product photo where personalization is drawn |
| Layer | Text / image / clipart / shape placed in a print area, optionally bound to an option |
| Design | One shopper's saved answers + canvas state, attached to a cart line |
| Render job | Server task that turns a design into preview and print files after an order |

## Editions

- **Options edition** (Zepto-like): form fields, conditions, price add-ons, simple preview. Parts 01–08 MVP sections.
- **Designer edition** (Customily-like): adds templates, multi-view print areas, print-ready files. The "v2" sections.
