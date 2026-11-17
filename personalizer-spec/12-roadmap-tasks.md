# Part 12 — Roadmap and agent prompts

About 24 weeks to a public launch with 2 developers; each phase ends at a gate you can stop at.

| Phase | Weeks | Delivers | Gate to pass |
|-------|-------|----------|--------------|
| 1 · MVP (Options edition) | 1–8 | Parts 01–05, 06 (simple preview), 07 option A, 08 (preview + PNG) | Your own store: 100% of test orders correct |
| 2 · Designer | 9–16 | Template editor, multi-view, curve text, SVG/PDF outputs, admin order block, edit-from-cart | Print files match preview in snapshot tests; 5 beta stores live |
| 3 · Public app | 17–24 | Billing, integrations, analytics, theme matrix hardening, App Store submission | App Store approval |

## How to run each task with the agent

For every task below, paste the prompt, then attach the spec files it names. Wait for the agent to finish, run the acceptance checks yourself, then move on.

Template:

```text
Task <ID>: <title>
Read: spec/00-README.md, spec/<files>.
Build exactly what the "Tasks" item(s) <list> in those files describe.
Done means: the acceptance checks listed for these items pass, tests are added,
and docs/changelog.md has a short entry. Mark any VERIFY items you resolved in docs/decisions.md.
Do not start other tasks.
```

## Task list

### Phase 1 — MVP

| ID | Title | Spec files | Tasks in file |
|----|-------|------------|---------------|
| T01 | Scaffold app, workspaces, DB, Redis, extension, proxy health, CI | 01 | 1–6 |
| T02 | Prisma schema, models, seed, upload cleanup | 02 | 1–4 |
| T03 | Contract types, zod, validate/visible/price/properties | 03 | 1–3 |
| T04 | Admin: navigation + option sets list | 04 | 1 |
| T05 | Admin: builder (palette, list, settings per type, autosave, undo) | 03, 04 | 2 |
| T06 | Admin: conditions + pricing tabs | 03, 04 | 3 |
| T07 | Admin: publish + assignment + bulk publish | 02, 03, 04, 09 | 4 |
| T08 | Admin: libraries (fonts, clipart, palettes) | 04, 10 | 5 |
| T09 | Widget: block + embed + text option render | 05 | 1 |
| T10 | Widget: all MVP option components | 03, 05 | 2 |
| T11 | Widget: variant tracking + conditions | 05 | 3 |
| T12 | Widget: slots option | 05 | 4 |
| T13 | Proxy: uploads endpoints + widget upload | 05, 09, 10 | 5 |
| T14 | Proxy: designs endpoint; widget form sync + submit guard | 05, 09 | 6 |
| T15 | Layout package: text + slots + measure (browser/server) | 06 | 1–2 |
| T16 | Widget: live preview overlay + PNG export | 06 | 3 |
| T17 | Fee product, splitter, fee add on submit, orphan cleanup | 07 | 1–4 |
| T18 | fee-guard validation function | 07 | 5 |
| T19 | Webhooks + ingest-order + render preview/PNG + order metafield | 08, 09 | 1–3 |
| T20 | Render retries, failure emails, order change handling | 08 | 4–5 |
| T21 | Admin: onboarding + orders + settings | 04 | 6–8 |
| T22 | Security MVP checklist + retention jobs | 10 | 1–2 |
| T23 | Snapshot tests + theme matrix (Dawn, Horizon) | 06, 11 | 5, matrix |
| **Gate 1** | Own store live; 100 test orders correct | — | — |

### Phase 2 — Designer

| ID | Title | Spec files |
|----|-------|------------|
| T24 | Template editor (Fabric.js) in admin | 03, 04 (§5), 06 |
| T25 | Multi-view preview + variant photos + view thumbnails | 06 |
| T26 | Curve text, column/free layouts, image crop | 06 |
| T27 | print_svg, proof_pdf, thread_sheet outputs | 08 |
| T28 | Admin order block extension | 08 |
| T29 | Edit personalization from cart | 05 |
| T30 | Date + hidden option types; multi-language labels | 03, 05 |
| **Gate 2** | Snapshot thresholds met; 5 beta stores live | — |

### Phase 3 — Public app

| ID | Title | Spec files |
|----|-------|------------|
| T31 | Billing plans, gates, usage records, cap emails | 10 |
| T32 | Custom webhook delivery + first POD provider | 08 |
| T33 | Optional Cart Transform pricing mode | 07 |
| T34 | Analytics (personalised vs not, top fonts/icons) | 04 |
| T35 | Theme matrix: 5 paid themes; per-theme overrides | 05, 11 |
| T36 | Load tests and scaling | 11 |
| T37 | Compliance webhooks, data export/delete, privacy docs | 09, 10 |
| T38 | App Store listing + submission | 10 |
| **Gate 3** | App Store approval | — |

## Tips for working with a coding agent

- Keep each session to one task; start a fresh session per task and re-attach `00-README.md`.
- After each task, commit, then run the acceptance checks yourself on the dev store.
- When the agent hits a VERIFY item, let it read current shopify.dev docs and record the answer; Shopify APIs change every quarter.
- Never let the agent edit generated files in `extensions/personalizer-theme/assets/` by hand; they come from the widget build.
