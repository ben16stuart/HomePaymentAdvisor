/* Home Comparison Summary — one card per imported home, six per printed page.
   Each home is run through the client's current scenarios (rate, term, closing
   costs stay global; price/taxes/HOA/insurance come from the listing). */
(() => {
  const MAX_PER_PAGE = 6;
  const MAX_SCENARIOS = 4; // keeps each card readable at 6-up density

  const state = HPA.loadLocal();
  const root = document.getElementById("homesRoot");
  const homes = (state && state.recentProperties) || [];

  if (!state || !state.inputs || !homes.length) {
    document.getElementById("emptyMsg").classList.remove("hidden");
    return;
  }

  const { inputs, client = {} } = state;
  const scenarios = (state.scenarios || []).slice(0, MAX_SCENARIOS);
  const hiddenScenarios = Math.max((state.scenarios || []).length - scenarios.length, 0);
  const m = HPA.money;
  const esc = HPA.esc;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  /* Listing values win; anything the listing didn't publish falls back to the
     calculator's current figure (called out in the footnote). */
  let usedFallback = false;
  function inputsFor(home) {
    const i = { ...inputs };
    if (home.price) i.price = home.price;
    if (home.annualTaxes) i.annualTaxes = home.annualTaxes; else usedFallback = true;
    if (home.hoaMonthly != null) i.hoaMonthly = home.hoaMonthly; else usedFallback = true;
    if (home.insMonthly) i.insMonthly = home.insMonthly; else usedFallback = true;
    return i;
  }

  const anyRent = scenarios.some((sc) => sc.includeRent) && HPA.num(inputs.rentalIncome) > 0;

  const pages = [];
  for (let i = 0; i < homes.length; i += MAX_PER_PAGE) {
    pages.push(homes.slice(i, i + MAX_PER_PAGE));
  }

  let html = "";
  pages.forEach((group, pageIdx) => {
    html += `<div class="page home-page">
      <div class="rpt-header homes-header">
        <div>
          <h1>Home Comparison Summary</h1>
          <div class="subtitle">Prepared ${today}${client.name ? ` for <strong>${esc(client.name)}</strong>` : ""}</div>
        </div>
        <div class="rpt-officer">
          ${client.preparedBy ? `<div class="name">${esc(client.preparedBy)}</div>` : ""}
          ${client.company ? `<div>${esc(client.company)}</div>` : ""}
          ${client.nmls ? `<div>NMLS #${esc(client.nmls)}</div>` : ""}
          ${client.phone ? `<div>${esc(client.phone)}</div>` : ""}
          ${pages.length > 1 ? `<div class="pg">Page ${pageIdx + 1} of ${pages.length}</div>` : ""}
        </div>
      </div>

      <div class="homes-grid">
        ${group.map(homeCard).join("")}
      </div>

      ${pageIdx === pages.length - 1 ? footer() : ""}
    </div>`;
  });

  root.innerHTML = html;

  function homeCard(home) {
    const hi = inputsFor(home);
    const rows = scenarios.map((sc) => {
      const c = HPA.compute(hi, sc);
      return { name: sc.name, pay: c.net, cash: c.cashToClose, rent: c.rent };
    });
    const facts = [];
    if (home.bedrooms) facts.push(`${home.bedrooms} bd`);
    if (home.bathrooms) facts.push(`${home.bathrooms} ba`);
    if (home.livingArea) facts.push(`${Number(home.livingArea).toLocaleString()} sqft`);
    if (home.yearBuilt) facts.push(`${home.yearBuilt}`);

    return `<div class="home-card">
      <div class="hc-head">
        <h3>${esc(home.address || "Imported Listing")}</h3>
        ${facts.length ? `<div class="hc-facts">${facts.join(" · ")}</div>` : ""}
      </div>
      <div class="hc-price">${home.price ? m(home.price) : "—"}</div>
      <div class="hc-meta">
        <span>Taxes ${hi.annualTaxes ? m(HPA.num(hi.annualTaxes) / 12) + "/mo" : "—"}</span>
        <span>HOA ${HPA.num(hi.hoaMonthly) > 0 ? m(hi.hoaMonthly) : "—"}</span>
        <span>Ins ${HPA.num(hi.insMonthly) > 0 ? m(hi.insMonthly) : "—"}</span>
      </div>
      <table class="hc-table">
        <thead><tr><th>Option</th><th>Monthly</th><th>Cash to close</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.name)}${r.rent > 0 ? ' <span class="rent-mark" title="net of rental income">†</span>' : ""}</td>
            <td>${m(r.pay)}</td>
            <td>${m(r.cash)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }

  function footer() {
    return `<div class="rpt-footer">
      Assumes ${HPA.num(inputs.rate)}% interest over ${inputs.termYears} years with
      ${m(inputs.closingCosts)} estimated closing costs on every home. Mortgage insurance is applied
      automatically by loan-to-value where required.
      ${usedFallback ? "Where a listing did not publish taxes, HOA dues, or insurance, the calculator's current values were used. " : ""}
      ${hiddenScenarios > 0 ? `Showing the first ${MAX_SCENARIOS} of ${scenarios.length + hiddenScenarios} scenarios — see the full report for the rest. ` : ""}
      ${anyRent ? "† Payment shown net of rental income for scenarios that include it. " : ""}
      These are estimates for discussion only — not a loan approval, commitment to lend, or a Loan
      Estimate under TRID. Actual figures vary by credit profile, property, occupancy, and market
      conditions at lock. ${client.company ? esc(client.company) + ". " : ""}Generated ${today}.
    </div>`;
  }
})();
