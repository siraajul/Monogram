# Part 10 — Billing, security, privacy, App Store

Security and privacy apply from day one. Billing and App Store items are for the public launch (v3).

## Billing (public app only)

Charge only through the Shopify Billing API.

| Plan key | Includes | Price idea (test before launch) |
|----------|----------|------|
| `free` | Dev stores; 1 option set; 20 personalised orders/month | $0 |
| `starter` | Options edition; 100 orders/month | low monthly |
| `growth` | Options edition; 500 orders/month; simple preview | mid monthly |
| `designer` | Templates, multi-view, print files, integrations; unlimited orders | higher monthly + capped usage fee per personalised item |

Implementation:
- `appSubscriptionCreate` with a recurring line item, plus a usage line item with a `cappedAmount` for `designer` (VERIFY input shape).
- Trial: 14 days. Development stores: free (test charges).
- Gate features with `requirePlan(shop, feature)` on the server and hide UI in admin.
- Usage: on each personalised line (Part 08) → `UsageRecord` + `appUsageRecordCreate` (idempotency key = line item id). Reverse via a negative record is not supported → instead skip billing for lines refunded before the nightly billing batch; document the policy.
- Email the merchant at 80% and 100% of order caps; at 100% the widget keeps working for 48 h grace, then shows the form without preview (never block checkout silently).

## Security checklist

- [ ] Verify HMAC on every webhook and app-proxy request.
- [ ] Session tokens for every admin API route; reject cross-shop ids (always scope queries by the session's shop).
- [ ] Presigned upload URLs: PUT only, 10-minute expiry, exact content-type and max size conditions.
- [ ] Sniff file type server-side from bytes; reject mismatches.
- [ ] Shopper SVG uploads: **reject** (only merchants may upload SVG clipart, and those are sanitized with DOMPurify server-side or svgo with script removal).
- [ ] Strip EXIF (location) from shopper photos.
- [ ] Malware scan uploads (ClamAV container) before marking complete — optional for MVP, required for public app.
- [ ] Escape all shopper text everywhere (admin, emails, PDFs). Never use `dangerouslySetInnerHTML` with shopper data.
- [ ] Design access tokens: 32 bytes random, compared in constant time.
- [ ] Fee signatures: HMAC-SHA256 with a per-shop secret.
- [ ] Rate limits on proxy endpoints.
- [ ] Encrypt Shopify access tokens at rest.
- [ ] Least scopes; request new scopes only when a feature needs them.
- [ ] Dependency audit in CI; pin versions.

## Privacy

- Data stored: shopper text, uploads, previews, order line references. No shopper names/emails stored beyond what's in the order reference.
- Retention: unused uploads 30 days; order files per merchant setting (default 365 days) then deleted.
- Mandatory compliance webhooks implemented (Part 09).
- Publish: privacy policy, DPA for merchants, sub-processor list (hosting, storage, email, Sentry).
- Allow the merchant to export and delete all data from Settings.

## App Store / Built for Shopify checklist (VERIFY current requirements before submission)

- [ ] Theme app extension only; uninstall leaves the theme intact.
- [ ] Storefront performance impact measured on Dawn and a Horizon theme (Lighthouse, before vs after) and within Shopify's limits.
- [ ] Embedded admin, Polaris, App Bridge, fast first load.
- [ ] Billing via Shopify; clear pricing page; free trial behaviour documented.
- [ ] Compliance webhooks pass.
- [ ] Original name, icon, screenshots, demo video, demo store, support email, docs site, privacy policy.
- [ ] No references to competitors' names in the listing or UI.
- [ ] Onboarding works without contacting support.

## Tasks

1. Security checklist items for MVP (HMAC, tokens, presigned limits, sniffing, EXIF strip, escaping, rate limits).
2. Retention jobs + data export/delete.
3. (v3) Billing plans, feature gates, usage records, cap emails.
4. (v3) App Store listing assets and submission.
