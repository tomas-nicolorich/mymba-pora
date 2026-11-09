# Mymba Porã

Static site (Rioplatense Spanish) that answers "is this brand cruelty-free?" from third-party Sources. Walking skeleton: Cruelty-Free Kitty only.

Requires Node >= 26. No npm dependencies.

## Commands

- `npm test` runs the `node:test` suite (normalization, dataset build from fixtures, Verdict).
- `npm run build-data` fetches every CFK brand (about 16 requests, one at a time, 2 s apart, client name `mymba-pora-bot/0.1`) and writes `data/dataset.json`.
- `npm run build-site` assembles the deployable `dist/` directory.
- Local preview: `python3 -m http.server` at the repo root, then open `/site/`.

## Layout

- `src/` pure modules shared by Node and the browser, no build step: `normalize.js`, `verdict.js`.
- `scripts/` Node-only: fetchers, `build-dataset.js` (pure), CLI entry points.
- `site/` static frontend; Fuse.js 7.5.0 is vendored in `site/vendor/` (Apache-2.0, license alongside).
- `data/` generated dataset. `test/` tests and fixtures.

The site imports `../../src/...` and `../data/dataset.json` relative to `site/`, so a deploy must publish `site/`, `src/` and `data/` side by side. `npm run build-site` does that (`dist/site/`, `dist/src/`, `dist/data/`, plus a root redirect).

## Leaping Bunny

Main Source. `scripts/fetch-lb.js` loads the Brands page to get the session cookie and the anti-forgery form token, then calls `/api/Query` (`List of Brands`, 50 per request, 2 s apart, same client name) following `HasNext`/`NextOffset` (about 2,300 brands). Kept per brand: `BrandId`, `TradingName`, `IsDirtyParent`, `fetched_at`, source URL and the detail-page link; categories are not on list items, so they are omitted until a later ticket adds them (the card shows them when present). Entries match brands on the normalized `TradingName` only, never `CompanyName`. `npm run build-data` fetches all three Sources.

## Cruelty Free International

Second Source for the same certification. `scripts/fetch-cfi.js` reads the public WordPress REST collection `approved_bra_dir_ltg` (about 418 brands, 100 per page, 2 s apart, same client name). Kept per brand: decoded title, link, publication date (`date`, shown as "En el directorio desde"), `fetched_at` and source URL. The directory has no categories. Entries match on the normalized name, like CFK.

Verdict rule 1: a brand listed in Leaping Bunny **or** Cruelty Free International gives "Libre de crueldad · Certificada por Leaping Bunny", whatever CFK says. Notes (they never change the Verdict, across rules 1-4), in this order: CFK says "No" (disagreement, with CFK's entry date); `IsDirtyParent`; CFK parent company and China Notes (also on certified brands); "Solo figura en el directorio de ..." when only one directory lists the brand. Rules 2-4 add a Note when CFK tags the brand "Leaping Bunny" but neither directory lists it.

## Verdict (rules 2-5 so far)

The Verdict is computed in the browser from the Source entries, so rule changes never need a refetch. No Leaping Bunny data yet, so every brand counts as not certified: CFK `Yes` is Verified cruelty-free, `No` is Not cruelty-free, `Grey Area` (or any unknown value) is Grey area with a reason listing the CFK testing flags that aren't exactly "No" (finished products, ingredients, suppliers, third parties, and a derived "sold where required by law"); a brand in no Source is Unknown with three questions to ask the brand.
