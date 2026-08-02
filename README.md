# Home Payment Advisor

A Flask web app for loan specialists to walk clients through monthly-payment
scenarios when buying a house — live sliders, side-by-side down-payment
comparisons, one-click Zillow listing import, and a polished printable report.

## Features

- **Live calculator** — sliders and fields for purchase price, rate, term,
  taxes, insurance, HOA, and closing costs; every scenario recalculates
  instantly.
- **Customizable scenarios** — 5/10/15/20% down out of the box; add, rename,
  duplicate, or delete scenarios, use % or $ down payments, and override the
  rate per scenario. PMI applies automatically by LTV (0.27% / 0.22% / 0.12% /
  none), with cash-to-close, max seller contribution, and 1/0, 2/1, and 3/2/1
  temporary buydown pricing on every card.
- **Zillow import via bookmarklet** — drag the "Send to Payment Advisor"
  button to your bookmarks bar once; on any Zillow listing, one click sends
  the price, most-recent-year property taxes, HOA, insurance, address, and
  photo straight into the calculator. (Server-side URL fetch and manual entry
  are available as fallbacks.)
- **Recent houses** — the last 10 imported listings live in a dropdown so you
  can flip between homes and compare payments with a client, plus a printable
  **home comparison summary** (six homes per page) showing each home's price,
  taxes, HOA, and payment/cash-to-close for every scenario.
- **New client reset** — one click clears the current client's details, homes,
  scenarios, and figures so the next client starts from a clean slate.
- **Payment targets** — named budget lines (e.g. "Comfort limit") drawn on
  the comparison chart with within/over chips on every scenario.
- **Cash available at closing** — see instantly which options the client's
  cash actually covers, and one-click a scenario that puts all of it to work.
- **Rental income** — per-scenario toggle for keep-and-rent-the-current-home
  comparisons, with a net effective payment shown wherever it applies.
- **Client report** — a print-ready report (browser print → save as PDF) with
  the officer's details, property card, assumptions, comparison chart and
  table, buydown options, and disclosures.
- **Saved clients** — save and reload complete setups by name, persisted
  server-side.

## Password gate (for hosting outside localhost)

Auth is off by default — matches every other app in this Docker setup. Set
**`SITE_PASSWORD`** as an environment variable to turn it on: every route
then requires that shared password before use, via a signed session cookie
(30-day expiry, "Log Out" appears in the topbar once enabled).

- `SECRET_KEY` (optional) — explicit session-signing key. If unset, one is
  derived from `SITE_PASSWORD` so it stays consistent across gunicorn's
  worker processes with zero extra config.
- The `/import` route (the Zillow bookmarklet's landing page) is always
  reachable without login — it carries the listing data in the URL fragment,
  which a login redirect would silently drop, and it exposes nothing itself.

## Running

### Docker

```bash
docker build -t home-payment-advisor .
docker run -d -p 127.0.0.1:7899:7860 -v "$PWD/data:/app/data" home-payment-advisor
```

Then open http://localhost:7899.

Or as a compose service:

```yaml
housepayment:
  build: ./HousePaymentOptions
  ports:
    - "127.0.0.1:7899:7860"
  volumes:
    - ./HousePaymentOptions/data:/app/data
  restart: unless-stopped
```

### Local

```bash
pip install -r requirements.txt
python3 app.py   # http://localhost:7896 (or set PORT / HOST)
```

## Notes

- The bookmarklet bakes in the app origin it was dragged from — install it
  from the address you actually use day to day.
- All figures are estimates for discussion; the report carries the standard
  not-a-loan-estimate disclosure.
- `data/` (saved client setups) is gitignored — it stays on your machine.
