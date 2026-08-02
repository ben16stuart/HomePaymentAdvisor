# Home Payment Advisor (HousePaymentOptions)

Flask web app for a loan specialist to walk clients through monthly-payment
scenarios when buying a house. Replicates the logic of
`Payment Calculator - Stuart.xlsx` (kept in this directory as the reference).

## Run

- **Docker (production-style):** `docker compose up -d --build housepayment`
  from `DockerApps/` → http://localhost:7899
- **Local dev:** `python3 app.py` → http://localhost:7896 (or set `PORT`).
  The `.claude/launch.json` config `house-payment-advisor` starts it with
  auto port assignment.

## Architecture

- `app.py` — Flask server. Routes: `/` (calculator), `/report` (printable
  report), `/homes` (six-per-page summary of every imported home),
  `/import` (bookmarklet handoff), `/api/saves` CRUD (JSON persisted to
  `data/saves.json`), `/api/zillow` (best-effort listing scrape).
- `static/js/calc.js` — the single source of truth for all mortgage math
  (`HPA.compute`), shared by calculator and report pages. Client-side only;
  the server does no calculation.
- `static/js/app.js` — calculator page controller; state lives in
  `localStorage` (`hpa_state_v1`) and is re-rendered on every input.
- `static/js/report.js` + `templates/report.html` — reads the same
  localStorage state and renders a print-first report (user prints to PDF).
- `static/js/homes.js` + `templates/homes.html` — per-home summary cards,
  chunked into pages of 6 (`.home-page` gets `break-after: page` in print).
  Each home overrides price/taxes/HOA/insurance; rate, term, and closing costs
  stay global. Cards cap at 4 scenarios to stay readable at 6-up density.
- **New Client** (`#btnNewClient`) resets to `HPA.defaultState()` — so any new
  top-level state field must be added there too, or the reset throws mid-render
  and silently saves nothing.

## Spreadsheet parity (do not change without checking the xlsx)

- P&I = `PMT(rate/12, term*12, loan)`.
- PMI annual factors by LTV: >90% → 0.27%, >85% → 0.22%, >80% → 0.12%, else 0.
- Buydown cost = sum of (full payment − reduced payment) × 12 over the
  bought-down years; 1/0, 2/1, 3/2/1 all offered per scenario.
- Max seller contribution: 3% of price when down < 10%, else 6%.
- "New construction" helper sets annual taxes to 1% of price.

## Zillow import (bookmarklet — the primary path)

Zillow aggressively bot-blocks server-side fetches, so the primary import path
is a **bookmarklet** generated client-side in the Browse Zillow modal
(`bookmarkletHref()` in `static/js/app.js`):

1. User drags "🏡 Send to Payment Advisor" to their bookmarks bar (once).
2. On a Zillow listing page, clicking it scrapes the page's own embedded JSON
   (regexes over `document.scripts` for `"price"`, `"taxAnnualAmount"`,
   `"propertyTaxRate"`, `"monthlyHoaFee"`, `"annualHomeownersInsurance"`,
   address fields, etc.) and opens `<app-origin>/import#<json>`.
3. `/import` (templates/import.html) stashes the payload in localStorage
   (`hpa_pending_import`) and redirects to `/`; any already-open calculator
   tab also applies it live via the `storage` event.

The bookmarklet hardcodes the origin it was generated from — drag it from the
app at the port you actually use (7899 in Docker). Fallbacks in the same
modal: server-side URL fetch (`/api/zillow`, often blocked) and manual entry.

Imported houses are kept in `state.recentProperties` (last 10, deduped by
URL/address) and surfaced as a dropdown in the property banner so the officer
can flip between recent houses; each entry stores the listing's numbers and
re-applies them on selection.

## Notes

- Flask runs with debug off, so **Jinja caches templates** — restart the
  server (or container) after editing files in `templates/`.
- `data/` is volume-mounted in Docker so saved client scenarios persist.
