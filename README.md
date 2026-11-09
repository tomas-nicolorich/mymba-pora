# Mymba Porã

Static site (Rioplatense Spanish) that answers "is this brand cruelty-free?" by combining three third-party Sources: Leaping Bunny, Cruelty Free International (CFI) and Cruelty-Free Kitty (CFK). The Verdict is computed in the browser from the stored Source entries, so rule changes never need a refetch. Terms (Source, Source entry, Verdict, Note, Alias) are defined in [GLOSSARY.md](GLOSSARY.md).

Requires Node >= 26. No npm dependencies.

## Commands

- `npm test` runs the `node:test` suite (normalization, dataset build from fixtures, Verdict, Aliases, safety rails, workflow shape).
- `npm run build-data` is the one local command: it fetches all three Sources and writes `data/dataset.json` (and refreshes `data/lb-details.json`). One request at a time, 2 s apart, client name `mymba-pora-bot/0.1`. The first run takes about 80 minutes (Leaping Bunny detail pages), later runs a few minutes.
- `npm run build-site` assembles the deployable `dist/` directory.
- Local preview: `python3 -m http.server` at the repo root, then open `/site/` (or `-d dist` after `build-site`).

## Layout

- `src/` pure modules shared by Node and the browser, no build step: `normalize.js` (name normalization), `verdict.js` (the Verdict rules and Notes), `labels.js` (the `SOURCES` list with keys and labels, and the suggestion labels).
- `scripts/` Node-only: `http.js` (client name, delay, WordPress pagination), one fetcher per Source (`fetch-cfk.js`, `fetch-lb.js`, `fetch-cfi.js`), `lb-details.js` (detail-page cache), `build-dataset.js` (pure), `job.js` (safety rails), CLI entry points `build-data.js` and `build-site.js`.
- `site/` static frontend; Fuse.js 7.5.0 is vendored in `site/vendor/` (Apache-2.0, license alongside).
- `data/` generated dataset, the Leaping Bunny cache and the hand-edited `aliases.json`. `test/` tests and fixtures.

The site imports `../../src/...` and `../data/dataset.json` relative to `site/`, so a deploy must publish `site/`, `src/` and `data/` side by side. `npm run build-site` does that (`dist/site/`, `dist/src/`, `dist/data/`, plus a root redirect).

## Safety rails

`scripts/job.js`: `npm run build-data` exits non-zero, naming the Source, if any Source fetch fails or a Source returns under 90% of its previous brand count (`counts` in `data/dataset.json`; the message shows both counts). A Source with no previous count uses first-run minimums (CFK 1300, Leaping Bunny 2000, Cruelty Free International 350). On failure `data/dataset.json` and `data/lb-details.json` are untouched; both are written only after validation passes.

## Sources

### Cruelty-Free Kitty

`scripts/fetch-cfk.js` reads the public WordPress REST collection `cfk_brand` (about 1,500 brands, 100 per page). Kept per brand: decoded name, link, `modified`, the `cruelty_free` status and the five testing flags, parent companies (and whether the parent doesn't test), certifications, `fetched_at` and source URL.

### Leaping Bunny

`scripts/fetch-lb.js` loads the Brands page to get the session cookie and the anti-forgery form token, then calls `/api/Query` (`List of Brands`, 50 per request) following `HasNext`/`NextOffset` (about 2,300 brands). Kept per brand: `BrandId`, `name` (the list's `CompanyName`, which is what leapingbunny.org shows; falls back to `TradingName` if blank), `trading_name` (the legal entity, kept for reference only), `IsDirtyParent`, `fetched_at`, source URL and the detail-page link. Entries match brands on the normalized display `name`, never on the legal `TradingName` (e.g. BrandId 2075 has TradingName "Unilever" but is the brand Schmidt's, so Unilever is not shown as certified).

**Detail-page cache.** "Certified since <year>" and "Products Sold" categories exist only on each brand's server-rendered detail page, so `scripts/lb-details.js` caches them in `data/lb-details.json` (BrandId to `year`, `categories`, `fetched_at`), committed to the repo. Each run fetches new BrandIds plus the 100 oldest cache entries (one request every 2 s). The entry gets `certified_since` and `categories`; the card shows "Certificada desde <year>" and the categories.

**Detail failures are deliberately not fatal.** A transient failure (network error, HTTP error) keeps the last known year and categories and retries on the next run; if there is no previous value, the year stays blank and nothing is cached. A page that loads but has no year (a missing brand returns HTTP 200 without the brand block) caches a blank year and warns. In every case the job continues: a missing year is cosmetic, and it must not block the weekly refresh of the Verdict data.

### Cruelty Free International

`scripts/fetch-cfi.js` reads the public WordPress REST collection `approved_bra_dir_ltg` (about 418 brands, 100 per page). Kept per brand: decoded title, link, publication date (`date`, shown as "En el directorio desde"), `fetched_at` and source URL. The directory has no categories. Entries match on the normalized name, like CFK.

## Aliases

Edit `data/aliases.json` by hand and run `npm run build-data`. Each entry names a Source (`cfk`, `lb` or `cfi`) and the entry's name as that Source shows it (also compared without accents or case).

```json
{
  "same_brand": [
    [
      { "source": "cfk", "name": "Dr. Bronner's" },
      { "source": "lb", "name": "Dr. Bronner's Magic Soaps" }
    ]
  ],
  "ignore": [{ "source": "lb", "name": "Marca equivocada" }]
}
```

- `same_brand`: groups of entries that are the same brand; they are merged into one (the first entry's name wins). Two entries from the same Source can't be merged; that warns.
- `ignore`: drops that entry from the dataset.
- An Alias pointing at an entry that doesn't exist breaks nothing: it leaves a `warning` in the output.
- If two entries of the same Source normalize to the same key, the build warns (`collision after normalization`), keeps both as separate brands, and the search shows them with their original name and Source.

## Weekly job and deploy

`.github/workflows/update-data.yml` is a single job that runs every Monday (06:17 UTC) and on manual trigger (Actions tab, "Run workflow"), on Node 26 with a 120-minute timeout, in the `github-pages` environment (permissions: `contents: write`, `pages: write`, `id-token: write`). Steps, in order: `npm test`, `npm run build-data`, `npm run build-site`, upload `dist/` as the Pages artifact, deploy it, and only then commit `data/dataset.json` and `data/lb-details.json` as `chore(data): weekly refresh <date>` (skipped when nothing changed) and push. If any step fails (including the safety rails above) nothing is committed and the run turns red, so GitHub emails the maintainer. Third-party actions are pinned to commit SHAs. Pages must be enabled with source "GitHub Actions" in the repo settings before the deploy step can succeed.

## Verdict

The five rules, in order:

1. Listed in Leaping Bunny or Cruelty Free International: Certified cruelty-free ("Libre de crueldad · Certificada por Leaping Bunny"), whatever CFK says.
2. Not certified, CFK `Yes`: Verified cruelty-free.
3. Not certified, CFK `No`: Not cruelty-free.
4. Not certified, CFK `Grey Area` (or any unknown value): Grey area, with a reason built from the CFK testing flags that are not "No" (finished products, ingredients, suppliers, third parties, and a derived "sold where required by law").
5. In no Source: Unknown, with three questions to ask the brand.

Notes qualify the Verdict but never change it. In this order (rules 2-4 only get the CFK ones):

- CFK lists a certified brand as not cruelty-free (disagreement, with the CFK entry date; Leaping Bunny is audited, so the CFK entry may be stale).
- Parent company: Leaping Bunny `IsDirtyParent`, or a CFK parent company that tests on animals.
- Mainland China: CFK says it is sold there (Yes) or can't confirm (Uncertain).
- Only one certification directory lists the brand (Leaping Bunny or Cruelty Free International).
- CFK tags the brand "Leaping Bunny" but neither directory lists it (rules 2-4).
