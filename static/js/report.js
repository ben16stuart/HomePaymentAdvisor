/* Payment Options Report — renders the saved calculator state into a printable page. */
(() => {
  const state = HPA.loadLocal();
  const root = document.getElementById("reportRoot");
  if (!state || !state.inputs || !Array.isArray(state.scenarios) || !state.scenarios.length) {
    document.getElementById("emptyMsg").classList.remove("hidden");
    return;
  }

  const { inputs, client = {}, property, targets = [] } = state;
  const rows = state.scenarios.map((sc) => ({ sc, name: sc.name, comp: HPA.compute(inputs, sc) }));
  const m = HPA.money;
  const esc = HPA.esc;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let html = "";

  /* ---- header ---- */
  html += `<div class="rpt-header">
    <div>
      <h1>Home Payment Options</h1>
      <div class="subtitle">Prepared ${today}${client.name ? ` for <strong>${esc(client.name)}</strong>` : ""}</div>
    </div>
    <div class="rpt-officer">
      ${client.preparedBy ? `<div class="name">${esc(client.preparedBy)}</div>` : ""}
      ${client.company ? `<div>${esc(client.company)}</div>` : ""}
      ${client.nmls ? `<div>NMLS #${esc(client.nmls)}</div>` : ""}
      ${client.phone ? `<div>${esc(client.phone)}</div>` : ""}
      ${client.email ? `<div>${esc(client.email)}</div>` : ""}
    </div>
  </div>`;

  /* ---- property ---- */
  if (property && (property.address || property.photo)) {
    const facts = [];
    if (property.beds) facts.push(`${property.beds} bd`);
    if (property.baths) facts.push(`${property.baths} ba`);
    if (property.sqft) facts.push(`${Number(property.sqft).toLocaleString()} sqft`);
    if (property.yearBuilt) facts.push(`Built ${property.yearBuilt}`);
    html += `<div class="rpt-property">
      ${property.photo ? `<img src="${esc(property.photo)}" alt="Property photo">` : ""}
      <div class="body">
        <h3>${esc(property.address || "Subject Property")}</h3>
        <div class="facts">${facts.map((f) => `<span>${f}</span>`).join("")}</div>
      </div>
    </div>`;
  }

  /* ---- assumptions ---- */
  html += `<div class="rpt-section">
    <h2>Assumptions</h2>
    <div class="assump-grid">
      ${assump("Purchase Price", m(inputs.price))}
      ${assump("Interest Rate", `${HPA.num(inputs.rate).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`)}
      ${assump("Loan Term", `${inputs.termYears} years`)}
      ${assump("Est. Closing Costs", m(inputs.closingCosts))}
      ${assump("Annual Property Taxes", m(inputs.annualTaxes))}
      ${assump("Homeowners Ins. / mo", m(inputs.insMonthly))}
      ${assump("HOA / mo", inputs.hoaMonthly > 0 ? m(inputs.hoaMonthly) : "None")}
      ${HPA.num(inputs.cashAvailable) > 0
        ? assump("Cash Available at Closing", m(inputs.cashAvailable))
        : assump("Scenarios Compared", String(rows.length))}
      ${rows.some((r) => r.comp.rent > 0)
        ? assump("Rental Income / mo", m(inputs.rentalIncome))
        : ""}
    </div>
  </div>`;

  /* ---- chart ---- */
  html += `<div class="rpt-section">
    <h2>Monthly Payment Comparison</h2>
    <div class="legend">${HPA.SERIES.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>
    ${HPA.buildChart(rows, targets, { width: 740 })}
  </div>`;

  /* ---- comparison table ---- */
  const cell = (fn) => rows.map((r) => `<td>${fn(r.comp, r.sc)}</td>`).join("");
  html += `<div class="rpt-section">
    <h2>Side-by-Side Detail</h2>
    <table class="cmp">
      <thead><tr><th>&nbsp;</th>${rows.map((r) => `<th>${esc(r.name)}</th>`).join("")}</tr></thead>
      <tbody>
        <tr class="group"><td colspan="${rows.length + 1}">Loan Structure</td></tr>
        <tr><td>Down Payment</td>${cell((c) => `${m(c.downAmt)} <span style="color:var(--ink-3)">(${c.downPct.toFixed(1)}%)</span>`)}</tr>
        <tr><td>Loan Amount</td>${cell((c) => m(c.loan))}</tr>
        <tr><td>Interest Rate</td>${cell((c) => c.rate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%")}</tr>
        <tr class="group"><td colspan="${rows.length + 1}">Monthly Payment</td></tr>
        <tr><td>Principal &amp; Interest</td>${cell((c) => m(c.pi))}</tr>
        <tr><td>Property Taxes</td>${cell((c) => m(c.taxes))}</tr>
        <tr><td>Homeowners Insurance</td>${cell((c) => m(c.ins))}</tr>
        <tr><td>Mortgage Insurance</td>${cell((c) => (c.mi > 0 ? m(c.mi) : "—"))}</tr>
        <tr><td>HOA Dues</td>${cell((c) => (c.hoa > 0 ? m(c.hoa) : "—"))}</tr>
        <tr class="total"><td>Total Monthly Payment</td>${cell((c) => m(c.total))}</tr>
        ${rows.some((r) => r.comp.rent > 0) ? `
        <tr><td>Rental Income (keeping current home)</td>${cell((c) => (c.rent > 0 ? `<span style="color:#0e7a4d;font-weight:600">−${m(c.rent)}</span>` : "—"))}</tr>
        <tr class="total net"><td>Net Effective Payment</td>${cell((c) => m(c.net))}</tr>` : ""}
        <tr class="group"><td colspan="${rows.length + 1}">Cash Needed</td></tr>
        <tr><td>Down Payment</td>${cell((c) => m(c.downAmt))}</tr>
        <tr><td>Est. Closing Costs</td>${cell(() => m(inputs.closingCosts))}</tr>
        <tr><td><strong>Total Cash to Close</strong></td>${cell((c) => `<strong>${m(c.cashToClose)}</strong>`)}</tr>
        ${HPA.num(inputs.cashAvailable) > 0 ? `
        <tr><td>vs. Cash Available (${m(inputs.cashAvailable)})</td>${cell((c) =>
          c.cashToClose <= HPA.num(inputs.cashAvailable)
            ? `<span style="color:#0e7a4d;font-weight:600">✓ ${m(HPA.num(inputs.cashAvailable) - c.cashToClose)} left</span>`
            : `<span style="color:#b3261e;font-weight:600">${m(c.cashToClose - HPA.num(inputs.cashAvailable))} short</span>`)}</tr>` : ""}
        <tr><td>Max Seller Contribution</td>${cell((c) => m(c.sellerMax))}</tr>
      </tbody>
    </table>
  </div>`;

  /* ---- targets ---- */
  const realTargets = targets.filter((t) => HPA.num(t.amount) > 0);
  if (realTargets.length) {
    html += `<div class="rpt-section">
      <h2>Payment Targets</h2>
      <div class="targets-list">
        ${realTargets.map((t) => `<span class="target-pill">${esc(t.label || "Target")}: ${m(t.amount)}/mo</span>`).join("")}
      </div>
    </div>`;
  }

  /* ---- buydowns ---- */
  html += `<div class="rpt-section allow-break">
    <h2>Temporary Rate Buydown Options</h2>
    <div class="bd-grid">
      ${rows.map((r) => `
        <div class="bd-card">
          <h4>${esc(r.name)}</h4>
          <table>
            ${Object.entries(r.comp.buydowns).map(([name, bd]) => `
              <tr><td><strong>${name} buydown</strong></td>
                  <td>${bd.years.slice(0, -1).map((y) => `${y.label.replace(/Year (\d) \((−\d%)\)/, "Yr $1 $2")}: ${m(y.pmt)}`).join(" · ")}</td></tr>
              <tr class="cost"><td>Cost (seller-paid at closing)</td><td>${m(bd.cost)}</td></tr>
            `).join("")}
          </table>
        </div>`).join("")}
    </div>
  </div>`;

  /* ---- footer ---- */
  html += `<div class="rpt-footer">
    This worksheet is an estimate provided for discussion purposes only and is not a loan approval,
    commitment to lend, or a Loan Estimate as defined under TRID. Actual rates, payments, mortgage
    insurance, taxes, and closing costs will vary based on credit profile, property, occupancy, and
    market conditions at the time of lock. Mortgage insurance figures assume conventional financing.
    Temporary buydown availability and seller contribution limits are subject to program guidelines.
    ${client.company ? esc(client.company) + ". " : ""}Generated ${today} with Home Payment Advisor.
  </div>`;

  root.innerHTML = html;

  function assump(k, v) {
    return `<div class="assump"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  }
})();
