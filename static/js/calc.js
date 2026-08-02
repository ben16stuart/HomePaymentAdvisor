/* Shared mortgage math + state helpers. Mirrors "Payment Calculator - Stuart.xlsx".
   Used by both the calculator page and the report page. */

const HPA = (() => {
  const STORAGE_KEY = "hpa_state_v1";

  /* Standard amortized payment (positive). PMT(rate/12, n, loan) in the sheet. */
  function pmt(monthlyRate, nPayments, principal) {
    if (principal <= 0 || nPayments <= 0) return 0;
    if (monthlyRate === 0) return principal / nPayments;
    const f = Math.pow(1 + monthlyRate, nPayments);
    return (principal * monthlyRate * f) / (f - 1);
  }

  /* PMI annual factor by LTV — matches the sheet's tiers:
     >90% LTV → 0.27%, >85% → 0.22%, >80% → 0.12%, ≤80% → none. */
  function autoMiFactor(ltv) {
    if (ltv > 0.9) return 0.0027;
    if (ltv > 0.85) return 0.0022;
    if (ltv > 0.8) return 0.0012;
    return 0;
  }

  /* Conventional max seller contribution: 3% when down < 10%, else 6% (per sheet). */
  function sellerMaxPct(downPct) {
    return downPct < 10 ? 0.03 : 0.06;
  }

  function defaultState() {
    return {
      client: { name: "", preparedBy: "", company: "", nmls: "", phone: "", email: "" },
      property: null, // {address, photo, beds, baths, sqft, yearBuilt, url}
      recentProperties: [], // last 10 imported listings, most recent first
      inputs: {
        price: 500000,
        annualTaxes: 5000,
        hoaMonthly: 0,
        insMonthly: 250,
        rate: 6.49,
        termYears: 30,
        closingCosts: 6500,
        cashAvailable: 0,
        rentalIncome: 0,
      },
      targets: [],
      scenarios: [
        { id: uid(), name: "5% Down", downType: "percent", downValue: 5, rateOverride: null, miOverride: null, enabled: true },
        { id: uid(), name: "10% Down", downType: "percent", downValue: 10, rateOverride: null, miOverride: null, enabled: true },
        { id: uid(), name: "15% Down", downType: "percent", downValue: 15, rateOverride: null, miOverride: null, enabled: true },
        { id: uid(), name: "20% Down", downType: "percent", downValue: 20, rateOverride: null, miOverride: null, enabled: true },
      ],
    };
  }

  function uid() {
    return "s" + Math.random().toString(36).slice(2, 9);
  }

  /* Compute every derived number for one scenario. */
  function compute(inputs, sc) {
    const price = num(inputs.price);
    const downAmt =
      sc.downType === "percent"
        ? (price * num(sc.downValue)) / 100
        : Math.min(num(sc.downValue), price);
    const loan = Math.max(price - downAmt, 0);
    const ltv = price > 0 ? loan / price : 0;
    const downPct = price > 0 ? (downAmt / price) * 100 : 0;

    const rate = (sc.rateOverride != null ? num(sc.rateOverride) : num(inputs.rate)) / 100;
    const n = num(inputs.termYears) * 12;
    const pi = pmt(rate / 12, n, loan);

    const taxes = num(inputs.annualTaxes) / 12;
    const ins = num(inputs.insMonthly);
    const hoa = num(inputs.hoaMonthly);
    const miFactor = sc.miOverride != null ? num(sc.miOverride) : autoMiFactor(ltv);
    const mi = (loan * miFactor) / 12;

    const escrow = taxes + ins + mi + hoa;
    const total = pi + escrow;
    /* Optional per-scenario credit: rent collected by keeping the current home. */
    const rent = sc.includeRent ? num(inputs.rentalIncome) : 0;
    const net = total - rent;
    const cashToClose = downAmt + num(inputs.closingCosts);

    /* Temporary buydowns: payment with the note rate reduced 1/2/3 points.
       Cost = sum of the monthly savings across the bought-down years (per sheet). */
    const p = (drop) => pmt(Math.max(rate - drop, 0) / 12, n, loan) + escrow;
    const p1 = p(0.01), p2 = p(0.02), p3 = p(0.03);
    const buydowns = {
      "1/0": { years: [{ label: "Year 1 (−1%)", pmt: p1 }, { label: `Years 2–${inputs.termYears}`, pmt: total }], cost: (total - p1) * 12 },
      "2/1": { years: [{ label: "Year 1 (−2%)", pmt: p2 }, { label: "Year 2 (−1%)", pmt: p1 }, { label: `Years 3–${inputs.termYears}`, pmt: total }], cost: (total - p2) * 12 + (total - p1) * 12 },
      "3/2/1": { years: [{ label: "Year 1 (−3%)", pmt: p3 }, { label: "Year 2 (−2%)", pmt: p2 }, { label: "Year 3 (−1%)", pmt: p1 }, { label: `Years 4–${inputs.termYears}`, pmt: total }], cost: (total - p3) * 12 + (total - p2) * 12 + (total - p1) * 12 },
    };

    const sellerMax = price * sellerMaxPct(downPct);

    return {
      downAmt, downPct, loan, ltv, rate: rate * 100, pi, taxes, ins, mi, hoa,
      miFactor, total, rent, net, cashToClose, buydowns, sellerMax,
    };
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  /* Formatting */
  const fmtUSD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  function money(v) { return fmtUSD.format(Math.round(v)); }
  function money0(v) { return fmtUSD0.format(v); }
  function pct(v, digits = 2) { return `${v.toFixed(digits)}%`; }

  function saveLocal(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* Chart palette — validated categorical slots (light surface). */
  const SERIES = [
    { key: "pi", label: "Principal & Interest", color: "#2a78d6" },
    { key: "taxes", label: "Taxes", color: "#eb6834" },
    { key: "ins", label: "Insurance", color: "#1baf7a" },
    { key: "mi", label: "Mortgage Ins. (PMI)", color: "#eda100" },
    { key: "hoa", label: "HOA", color: "#e87ba4" },
  ];

  /* Build the payment-comparison stacked bar chart as an SVG string.
     rows: [{name, comp}] — comp from compute(). targets: [{label, amount}]. */
  function buildChart(rows, targets, opts = {}) {
    const width = opts.width || 860;
    const barH = 34, gap = 26, padTop = 8, padBottom = 30;
    const anyRent = rows.some((r) => r.comp.rent > 0);
    const labelW = 150, valueW = anyRent ? 150 : 84, padRight = 16;
    const plotW = width - labelW - valueW - padRight;
    const height = padTop + rows.length * (barH + gap) - gap + padBottom;

    const maxTotal = Math.max(
      ...rows.map((r) => r.comp.total),
      ...targets.map((t) => num(t.amount)),
      1
    );
    const scale = (v) => (v / (maxTotal * 1.06)) * plotW;

    let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Monthly payment comparison" font-family="inherit">`;

    // gridlines at round dollar steps
    const axisMax = maxTotal * 1.06;
    const rawStep = axisMax / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep);
    for (let v = step; v <= axisMax; v += step) {
      const x = labelW + scale(v);
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${height - padBottom + 6}" stroke="var(--grid, #e7e4dd)" stroke-width="1"/>`;
      svg += `<text x="${x}" y="${height - padBottom + 20}" text-anchor="middle" font-size="11" fill="var(--ink-3, #8a877e)">${money(v)}</text>`;
    }

    rows.forEach((r, i) => {
      const y = padTop + i * (barH + gap);
      const c = r.comp;
      svg += `<text x="${labelW - 12}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="13" font-weight="600" fill="var(--ink-1, #1b2430)">${esc(r.name)}</text>`;
      let x = labelW;
      SERIES.forEach((s) => {
        const v = c[s.key];
        if (v <= 0) return;
        const w = Math.max(scale(v) - 2, 0.5); // 2px surface gap between segments
        svg += `<rect x="${x}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${s.color}">` +
          `<title>${esc(r.name)} — ${s.label}: ${money(v)}/mo</title></rect>`;
        x += scale(v);
      });
      const netNote = c.rent > 0 ? ` <tspan font-size="11.5" font-weight="600" fill="#0e7a4d">(${money(c.net)} net)</tspan>` : "";
      svg += `<text x="${x + 8}" y="${y + barH / 2 + 4}" font-size="13" font-weight="700" fill="var(--ink-1, #1b2430)">${money(c.total)}${netNote}</text>`;
    });

    // target lines
    targets.forEach((t) => {
      const amt = num(t.amount);
      if (amt <= 0) return;
      const x = labelW + scale(amt);
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${height - padBottom + 6}" stroke="#b3261e" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      svg += `<text x="${x + 5}" y="12" font-size="11" font-weight="600" fill="#b3261e">${esc(t.label || "Target")} ${money(amt)}</text>`;
    });

    svg += "</svg>";
    return svg;
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  return {
    pmt, autoMiFactor, sellerMaxPct, defaultState, uid, compute, num,
    money, money0, pct, saveLocal, loadLocal, SERIES, buildChart, esc,
    STORAGE_KEY,
  };
})();
