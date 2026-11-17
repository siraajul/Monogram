# Part 07 — Pricing add-ons

Goal: charge extra for personalization on every Shopify plan.

Shopify limits the price-changing Cart Transform `lineUpdate` operation to Shopify Plus and development stores (see shopify.dev Cart Transform docs; VERIFY at build time). So the **default** is a hidden fee product. Cart Transform is an optional upgrade.

## Option A (default): hidden fee product — all plans

### Setup (on install, and repairable from Settings)
1. Create product "Personalization" (title configurable), status ACTIVE, **not** published to the Online Store sales channel's collections/search (VERIFY: publish only so it can be added to cart, hide from search with `seo.hidden` metafield or `templateSuffix`), no inventory tracking, requires shipping = false, taxable = true.
2. Create variants for denominations so any amount can be built with few lines: **$0.01, $0.10, $1, $10, $100** (in shop currency). Store their variant ids in `Shop.settings.feeVariants`.
   - Alternative (simpler, recommended for MVP): one $0.01 variant with quantity = cents. Downside: quantity shows e.g. "× 1000". Use denominations if the cart shows quantities prominently.
3. Save `Shop.feeProductId`.

### Adding the fee
In the submit guard (Part 05), after the design is saved and when `priceFor() > 0`:

```ts
await fetch("/cart/add.js", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: [
    { id: productVariantId, quantity: qty, properties: { ...props, _group: group } },
    ...feeLines(amount * qty).map(f => ({ id: f.variantId, quantity: f.qty,
        properties: { _pz_fee_for: group, "For": productTitle } }))
  ]})
});
```
Then trigger the theme's cart refresh: dispatch common events (`cart:refresh`, `cart:updated`), and if the theme has a cart drawer custom element with a known refresh method use the per-theme override; else navigate to `/cart`.

Because this replaces the theme's own add-to-cart call, only do it when a fee is due. When no fee, let the theme submit normally.

### Keeping fee lines honest
- **Orphan cleanup (storefront)**: on every page load, the embed fetches `/cart.js`; any fee line whose `_pz_fee_for` group has no product line → `change.js` quantity 0. Fee quantity follows product quantity changes.
- **Checkout guard (server-side, required)**: Cart & checkout validation Function `fee-guard`:
  - Error if a fee line exists without a matching `_group` product line.
  - Error if the fee total for a group is less than the recomputed expected amount (send expected cents as a hidden property `_pz_fee_cents` on the product line, signed with HMAC of `group|cents|shop` using an app secret stored in a shop metafield the function can read — VERIFY function input access to metafields).
- Discounts: by default exclude the fee product from automatic discounts (document for merchants).

## Option B (optional): Cart Transform

- `lineExpand`: expand the personalised line into [product, fee] components so the cart shows one line. Available beyond Plus (VERIFY current plan rules).
- `lineUpdate`: set the line price = product price + fee. **Plus and dev stores only.**
- Implement as Function `price-transform` reading `_pz_fee_cents` (+ signature) from line attributes.
- Setting in admin: "Pricing mode: Fee product (all plans) / Single cart line (requires eligible plan)". Detect plan via `shop.plan` and only enable B when eligible.

## Money handling

- All prices stored in shop currency, major units in config, integer cents everywhere else.
- Display with `shop.money_format`; for multi-currency stores, multiply by `Shopify.currency.rate` for display only; the fee variant price converts automatically at checkout.

## Tasks

1. Fee product creation + repair action.
2. `feeLines(cents)` greedy denomination splitter + tests.
3. Submit-path fee add + cart refresh hooks.
4. Orphan cleanup in the embed.
5. `fee-guard` validation function.
6. (Optional) Cart Transform function + admin setting.

## Acceptance checks

- [ ] Personalised product with +$12.50 fee → cart total increases by exactly $12.50 × quantity.
- [ ] Removing the product removes its fee line on next page load; checkout with only a fee line is blocked by the function.
- [ ] Tampering `_pz_fee_cents` in the browser is rejected at checkout.
