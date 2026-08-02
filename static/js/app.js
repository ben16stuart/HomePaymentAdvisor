/* Home Payment Advisor — main page controller. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  let state = HPA.loadLocal() || HPA.defaultState();
  // Guard against older/corrupt saved state
  if (!state.inputs || !Array.isArray(state.scenarios)) state = HPA.defaultState();
  if (!Array.isArray(state.targets)) state.targets = [];
  if (!state.client) state.client = HPA.defaultState().client;
  if (!Array.isArray(state.recentProperties)) state.recentProperties = [];
  // Clean up any duplicate recents left behind by earlier versions
  {
    const seen = new Set();
    state.recentProperties = state.recentProperties.filter((r) => {
      const k = ((r && (r.address || r.url)) || "").trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const INPUT_KEYS = ["price", "rate", "termYears", "annualTaxes", "insMonthly", "hoaMonthly", "closingCosts", "cashAvailable", "rentalIncome"];
  if (state.inputs.cashAvailable == null) state.inputs.cashAvailable = 0;
  if (state.inputs.rentalIncome == null) state.inputs.rentalIncome = 0;
  const CLIENT_KEYS = ["name", "preparedBy", "company", "nmls", "phone", "email"];

  /* ---------------------------------------------------------- rendering */
  function renderAll() {
    syncInputs();
    renderClient();
    renderTargets();
    renderProperty();
    renderScenarios();
    renderChart();
    HPA.saveLocal(state);
  }

  function renderDerived() {
    renderScenarios();
    renderChart();
    HPA.saveLocal(state);
  }

  function syncInputs() {
    INPUT_KEYS.forEach((key) => {
      const num = $(`#in-${key}`);
      const slider = $(`#sl-${key}`);
      const val = state.inputs[key];
      if (document.activeElement !== num) num.value = formatInput(key, val);
      slider.value = val;
      paintSlider(slider);
    });
  }

  function formatInput(key, val) {
    if (key === "rate") return String(val);
    if (key === "termYears") return String(val);
    return Number(val).toLocaleString("en-US");
  }

  function paintSlider(slider) {
    const min = +slider.min, max = +slider.max, v = +slider.value;
    const fill = ((v - min) / (max - min)) * 100;
    slider.style.setProperty("--fill", `${Math.max(0, Math.min(100, fill))}%`);
  }

  function renderClient() {
    CLIENT_KEYS.forEach((k) => {
      const el = $(`#cl-${k}`);
      if (el && document.activeElement !== el) el.value = state.client[k] || "";
    });
  }

  function renderTargets() {
    const wrap = $("#targetList");
    wrap.innerHTML = "";
    state.targets.forEach((t) => {
      const row = document.createElement("div");
      row.className = "target-row";
      row.innerHTML = `
        <input type="text" class="t-label" placeholder="Label" value="${HPA.esc(t.label || "")}">
        <input type="text" class="t-amount" inputmode="decimal" placeholder="$/mo" value="${t.amount || ""}">
        <button class="btn-icon" title="Remove">✕</button>`;
      row.querySelector(".t-label").addEventListener("input", (e) => {
        t.label = e.target.value; renderDerived();
      });
      row.querySelector(".t-amount").addEventListener("input", (e) => {
        t.amount = HPA.num(e.target.value); renderDerived();
      });
      row.querySelector(".btn-icon").addEventListener("click", () => {
        state.targets = state.targets.filter((x) => x.id !== t.id);
        renderAll();
      });
      wrap.appendChild(row);
    });
  }

  function recentDropdown() {
    const recents = state.recentProperties;
    if (!recents.length) return "";
    const cur = state.property ? (state.property.url || state.property.address) : null;
    const opts = recents.map((r, i) => {
      const key = r.url || r.address;
      return `<option value="${i}" ${key === cur ? "selected" : ""}>${HPA.esc(r.address || "Unnamed listing")}</option>`;
    }).join("");
    return `<select id="recentSel" class="recent-sel" title="Switch between recently imported houses">
      ${cur ? "" : `<option value="" selected>Recent houses (${recents.length})…</option>`}
      ${opts}
    </select>`;
  }

  function compareHomesBtn() {
    if (state.recentProperties.length < 2) return "";
    return `<button class="btn btn-outline btn-sm" id="btnCompareHomes"
      title="Printable summary of every home imported for this client">📊 Compare all ${state.recentProperties.length} homes</button>`;
  }

  function renderProperty() {
    const el = $("#propertyBanner");
    const p = state.property;
    if (!p && !state.recentProperties.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.classList.remove("hidden");

    if (!p) {
      // No active property, but there are recents to pick from
      el.innerHTML = `
        <div class="pb-body pb-compact">
          <span class="pb-label">Compare a previous house:</span>
          ${recentDropdown()}
          ${compareHomesBtn()}
        </div>`;
    } else {
      const facts = [];
      if (p.beds) facts.push(`${p.beds} bd`);
      if (p.baths) facts.push(`${p.baths} ba`);
      if (p.sqft) facts.push(`${Number(p.sqft).toLocaleString()} sqft`);
      if (p.yearBuilt) facts.push(`Built ${p.yearBuilt}`);
      el.innerHTML = `
        ${p.photo ? `<img src="${HPA.esc(p.photo)}" alt="Listing photo">` : ""}
        <div class="pb-body">
          <h3>${HPA.esc(p.address || "Imported Listing")}</h3>
          <div class="pb-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</div>
          ${p.url ? `<a href="${HPA.esc(p.url)}" target="_blank" rel="noopener" class="mini-link">View on Zillow ↗</a>` : ""}
        </div>
        <div class="pb-actions">
          ${state.recentProperties.length > 1 ? recentDropdown() : ""}
          ${compareHomesBtn()}
          <button class="btn-icon" id="btnClearProp" title="Remove property">✕</button>
        </div>`;
      $("#btnClearProp").addEventListener("click", () => { state.property = null; renderAll(); });
    }

    const cmp = $("#btnCompareHomes");
    if (cmp) cmp.addEventListener("click", () => {
      HPA.saveLocal(state);
      window.open("/homes", "_blank");
    });

    const sel = $("#recentSel");
    if (sel) sel.addEventListener("change", () => {
      const r = state.recentProperties[+sel.value];
      if (r) { applyListing(r); toast(`Switched to ${r.address || "listing"}.`); }
    });
  }

  /* ---------------------------------------------------------- scenarios */
  function renderScenarios() {
    const wrap = $("#cards");
    wrap.innerHTML = "";
    const comps = state.scenarios.map((sc) => ({ sc, comp: HPA.compute(state.inputs, sc) }));
    // Rank scenarios by what the client actually pays each month (net of rent)
    const bestTotal = Math.min(...comps.map((x) => x.comp.net).filter((v) => v > 0));

    comps.forEach(({ sc, comp }) => {
      const card = document.createElement("div");
      const isBest = comp.net === bestTotal && comps.length > 1;
      card.className = "card" + (isBest ? " best" : "");
      const overTargets = state.targets.filter((t) => HPA.num(t.amount) > 0);
      const chips = overTargets.map((t) => {
        const ok = comp.net <= HPA.num(t.amount);
        return `<span class="chip ${ok ? "ok" : "over"}">${HPA.esc(t.label || "Target")}: ${ok ? "✓ within" : "+" + HPA.money(comp.net - HPA.num(t.amount))}</span>`;
      }).join("");
      const rentAvail = HPA.num(state.inputs.rentalIncome) > 0;

      const isPct = sc.downType === "percent";
      card.innerHTML = `
        <div class="card-head">
          <input type="text" class="sc-name" value="${HPA.esc(sc.name)}" title="Rename scenario">
          ${isBest ? `<span class="badge">LOWEST PAYMENT</span>` : ""}
        </div>
        <div class="card-body">
          <div class="down-ctl">
            <div class="seg">
              <button class="seg-pct ${isPct ? "on" : ""}">%</button>
              <button class="seg-amt ${!isPct ? "on" : ""}">$</button>
            </div>
            <input type="text" class="down-val" inputmode="decimal"
              value="${isPct ? sc.downValue : Number(sc.downValue).toLocaleString("en-US")}">
            <span class="down-eq">${isPct ? "= " + HPA.money(comp.downAmt) : "= " + comp.downPct.toFixed(1) + "%"} down</span>
          </div>
          ${isPct ? `<input type="range" class="sc-range" min="0" max="60" step="0.5" value="${sc.downValue}">` : ""}

          <div>
            <div class="kv"><span class="k">Loan Amount</span><span class="v">${HPA.money(comp.loan)}</span></div>
            <div class="kv"><span class="k">LTV</span><span class="v">${(comp.ltv * 100).toFixed(1)}%</span></div>
            <div class="divider"></div>
            <div class="kv sub"><span class="k">Principal &amp; Interest</span><span class="v">${HPA.money(comp.pi)}</span></div>
            <div class="kv sub"><span class="k">Property Taxes</span><span class="v">${HPA.money(comp.taxes)}</span></div>
            <div class="kv sub"><span class="k">Homeowners Insurance</span><span class="v">${HPA.money(comp.ins)}</span></div>
            <div class="kv sub"><span class="k">Mortgage Insurance${comp.miFactor ? ` (${(comp.miFactor * 100).toFixed(2)}%)` : ""}</span><span class="v">${comp.mi > 0 ? HPA.money(comp.mi) : "—"}</span></div>
            <div class="kv sub"><span class="k">HOA</span><span class="v">${comp.hoa > 0 ? HPA.money(comp.hoa) : "—"}</span></div>
          </div>

          <div class="total-line"><span class="k">Total Monthly Payment</span><span class="v">${HPA.money(comp.total)}</span></div>
          ${rentAvail ? `
          <label class="rent-toggle">
            <input type="checkbox" class="sc-rent" ${sc.includeRent ? "checked" : ""}>
            Include rental income (−${HPA.money(HPA.num(state.inputs.rentalIncome))}/mo)
          </label>` : ""}
          ${comp.rent > 0 ? `
          <div class="kv"><span class="k">Rental Income Credit</span><span class="v" style="color:var(--good)">−${HPA.money(comp.rent)}</span></div>
          <div class="total-line net"><span class="k">Net Effective Payment</span><span class="v">${HPA.money(comp.net)}</span></div>` : ""}
          ${chips ? `<div class="target-chips">${chips}</div>` : ""}

          <div>
            <div class="kv"><span class="k">Down Payment</span><span class="v">${HPA.money(comp.downAmt)}</span></div>
            <div class="kv"><span class="k">Est. Closing Costs</span><span class="v">${HPA.money(HPA.num(state.inputs.closingCosts))}</span></div>
            <div class="kv"><span class="k">Total Cash to Close</span><span class="v">${HPA.money(comp.cashToClose)}</span></div>
            <div class="kv"><span class="k">Max Seller Contribution</span><span class="v">${HPA.money(comp.sellerMax)}</span></div>
            ${cashChipHtml(comp)}
          </div>

          <details>
            <summary>Rate buydown options</summary>
            ${buydownTable(comp)}
            <p class="bd-note">Buydown cost is typically paid via seller contribution at closing.</p>
          </details>
        </div>
        <div class="card-foot">
          <div class="rate-override">
            <label>Rate</label>
            <input type="text" class="rate-ovr" inputmode="decimal"
              placeholder="${HPA.num(state.inputs.rate)}%" value="${sc.rateOverride != null ? sc.rateOverride : ""}">
          </div>
          <div class="right">
            <button class="btn-icon act-dup" title="Duplicate scenario">⧉</button>
            <button class="btn-icon act-del" title="Delete scenario">🗑</button>
          </div>
        </div>`;

      // wire card controls
      $(".sc-name", card).addEventListener("input", (e) => { sc.name = e.target.value; renderChart(); HPA.saveLocal(state); });
      $(".seg-pct", card).addEventListener("click", () => {
        if (sc.downType !== "percent") { sc.downType = "percent"; sc.downValue = Math.round(comp.downPct * 2) / 2; renderDerived(); }
      });
      $(".seg-amt", card).addEventListener("click", () => {
        if (sc.downType !== "amount") { sc.downType = "amount"; sc.downValue = Math.round(comp.downAmt); renderDerived(); }
      });
      $(".down-val", card).addEventListener("change", (e) => {
        sc.downValue = HPA.num(e.target.value.replace(/,/g, "")); renderDerived();
      });
      const range = $(".sc-range", card);
      if (range) range.addEventListener("input", (e) => { sc.downValue = +e.target.value; renderDerived(); });
      const rentBox = $(".sc-rent", card);
      if (rentBox) rentBox.addEventListener("change", (e) => { sc.includeRent = e.target.checked; renderDerived(); });
      $(".rate-ovr", card).addEventListener("change", (e) => {
        const v = e.target.value.trim();
        sc.rateOverride = v === "" ? null : HPA.num(v);
        renderDerived();
      });
      $(".act-dup", card).addEventListener("click", () => {
        const copy = { ...sc, id: HPA.uid(), name: sc.name + " (copy)" };
        state.scenarios.splice(state.scenarios.indexOf(sc) + 1, 0, copy);
        renderDerived();
      });
      $(".act-del", card).addEventListener("click", () => {
        state.scenarios = state.scenarios.filter((x) => x.id !== sc.id);
        renderDerived();
      });

      wrap.appendChild(card);
    });
  }

  /* Chip comparing this scenario's cash to close against the client's cash. */
  function cashChipHtml(comp) {
    const cash = HPA.num(state.inputs.cashAvailable);
    if (cash <= 0) return "";
    const chip = comp.cashToClose <= cash
      ? `<span class="chip ok">✓ Cash covers it — ${HPA.money(cash - comp.cashToClose)} left over</span>`
      : `<span class="chip over">Needs ${HPA.money(comp.cashToClose - cash)} more cash</span>`;
    return `<div class="target-chips" style="margin-top:6px">${chip}</div>`;
  }

  function buydownTable(comp) {
    const rows = Object.entries(comp.buydowns).map(([name, bd]) => {
      const yrs = bd.years.slice(0, -1).map((y) => `${y.label}: <strong>${HPA.money(y.pmt)}</strong>`).join("<br>");
      return `<tr><td><strong>${name}</strong></td><td>${yrs}</td><td>${HPA.money(bd.cost)}</td></tr>`;
    }).join("");
    return `<table class="bd-table">
      <thead><tr><th>Buydown</th><th>Reduced payments</th><th>Cost</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  function renderChart() {
    const rows = state.scenarios.map((sc) => ({ name: sc.name, comp: HPA.compute(state.inputs, sc) }));
    $("#chart").innerHTML = rows.length
      ? HPA.buildChart(rows, state.targets)
      : `<p class="panel-hint">Add a scenario to see the comparison.</p>`;
    $("#chartLegend").innerHTML = HPA.SERIES
      .map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`)
      .join("");
  }

  /* ---------------------------------------------------------- input wiring */
  INPUT_KEYS.forEach((key) => {
    const num = $(`#in-${key}`);
    const slider = $(`#sl-${key}`);
    slider.addEventListener("input", () => {
      state.inputs[key] = +slider.value;
      paintSlider(slider);
      num.value = formatInput(key, state.inputs[key]);
      renderDerived();
    });
    num.addEventListener("change", () => {
      state.inputs[key] = HPA.num(num.value.replace(/,/g, ""));
      syncInputs();
      renderDerived();
    });
  });

  $("#btnCashScenario").addEventListener("click", () => {
    const cash = HPA.num(state.inputs.cashAvailable);
    const down = Math.max(cash - HPA.num(state.inputs.closingCosts), 0);
    if (down <= 0) {
      toast("Set Cash Available higher than closing costs first.", true);
      return;
    }
    state.scenarios.push({
      id: HPA.uid(), name: `All-In Cash (${HPA.money(cash)})`,
      downType: "amount", downValue: down,
      rateOverride: null, miOverride: null, enabled: true,
    });
    renderDerived();
    toast(`Added scenario with ${HPA.money(down)} down — your cash minus closing costs.`);
  });

  $("#btnTaxRule").addEventListener("click", () => {
    state.inputs.annualTaxes = Math.round(HPA.num(state.inputs.price) * 0.01);
    renderAll();
    toast("Taxes set to 1% of purchase price (new construction rule).");
  });

  CLIENT_KEYS.forEach((k) => {
    $(`#cl-${k}`).addEventListener("input", (e) => {
      state.client[k] = e.target.value;
      HPA.saveLocal(state);
    });
  });

  $("#btnAddTarget").addEventListener("click", () => {
    state.targets.push({ id: HPA.uid(), label: "", amount: "" });
    renderAll();
  });

  $("#btnAddScenario").addEventListener("click", () => {
    state.scenarios.push({
      id: HPA.uid(), name: "Custom Scenario", downType: "percent", downValue: 25,
      rateOverride: null, miOverride: null, enabled: true,
    });
    renderDerived();
  });

  /* ---------------------------------------------------------- modals */
  function openModal(id) { $(`#${id}`).classList.remove("hidden"); }
  function closeModal(id) { $(`#${id}`).classList.add("hidden"); }
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
  $$(".modal-backdrop").forEach((bd) => bd.addEventListener("click", (e) => {
    if (e.target === bd) bd.classList.add("hidden");
  }));

  /* Zillow */
  $("#bookmarklet").href = bookmarkletHref();
  $("#bookmarklet").addEventListener("click", (e) => {
    e.preventDefault();
    toast("Don't click it here — drag the button up into your bookmarks bar, then use it on a Zillow listing.", true);
  });
  $("#btnZillow").addEventListener("click", () => { $("#zillowError").classList.add("hidden"); openModal("zillowModal"); });
  $("#btnOpenZillow").addEventListener("click", () => window.open("https://www.zillow.com", "_blank", "noopener"));
  $("#btnImportZillow").addEventListener("click", async () => {
    const url = $("#zillowUrl").value.trim();
    const errEl = $("#zillowError");
    errEl.classList.add("hidden");
    if (!url) { errEl.textContent = "Paste a Zillow listing URL first."; errEl.classList.remove("hidden"); return; }
    const btn = $("#btnImportZillow");
    btn.disabled = true; btn.textContent = "Importing…";
    try {
      const res = await fetch("/api/zillow", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed.");
      applyListing(json.data);
      closeModal("zillowModal");
      toast(`Imported ${json.data.address || "listing"} — inputs updated.`);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
      $("#zillowManual").open = true;
    } finally {
      btn.disabled = false; btn.textContent = "Import";
    }
  });
  $("#btnManualApply").addEventListener("click", () => {
    const data = {
      address: $("#mz-address").value.trim(),
      price: HPA.num($("#mz-price").value.replace(/,/g, "")) || null,
      annualTaxes: HPA.num($("#mz-taxes").value.replace(/,/g, "")) || null,
      hoaMonthly: HPA.num($("#mz-hoa").value.replace(/,/g, "")) || 0,
      url: $("#zillowUrl").value.trim() || null,
    };
    if (!data.price) { toast("Enter at least a list price.", true); return; }
    applyListing(data);
    closeModal("zillowModal");
    toast("Listing applied to calculator.");
  });

  function applyListing(d) {
    if (d.price) state.inputs.price = Math.round(d.price);
    if (d.annualTaxes) state.inputs.annualTaxes = Math.round(d.annualTaxes);
    if (d.hoaMonthly != null) state.inputs.hoaMonthly = Math.round(d.hoaMonthly);
    if (d.insMonthly) state.inputs.insMonthly = Math.round(d.insMonthly);
    state.property = {
      address: d.address || null, photo: d.photo || null, url: d.url || null,
      beds: d.bedrooms || d.beds || null, baths: d.bathrooms || d.baths || null,
      sqft: d.livingArea || d.sqft || null, yearBuilt: d.yearBuilt || null,
      zestimate: d.zestimate || null,
    };
    addRecent(d);
    renderAll();
  }

  /* Keep the last 10 imported houses (most recent first, deduped by address). */
  function recentKey(r) {
    return (r.address || r.url || "").trim().toLowerCase();
  }
  function addRecent(d) {
    const key = recentKey(d);
    if (!key) return;
    state.recentProperties = state.recentProperties.filter((r) => recentKey(r) !== key);
    state.recentProperties.unshift({
      address: d.address || null, price: d.price || null,
      annualTaxes: d.annualTaxes || null, hoaMonthly: d.hoaMonthly ?? null,
      insMonthly: d.insMonthly || null, photo: d.photo || null, url: d.url || null,
      bedrooms: d.bedrooms || d.beds || null, bathrooms: d.bathrooms || d.baths || null,
      livingArea: d.livingArea || d.sqft || null, yearBuilt: d.yearBuilt || null,
      importedAt: d.importedAt || Date.now(),
    });
    state.recentProperties = state.recentProperties.slice(0, 10);
  }

  /* ------------------------------------------- bookmarklet import channel */
  // Self-contained script that runs on a Zillow listing page (installed by
  // dragging the anchor to the bookmarks bar). It reads the listing data the
  // page has already loaded and hands it to this app via /import#<json>.
  function bookmarkletHref() {
    const code = `(()=>{
      const T=[...document.scripts].map(s=>s.textContent||'').join('\\n');
      const n=(re)=>{const m=T.match(re);return m?parseFloat(m[1]):null;};
      const s=(re)=>{const m=T.match(re);return m?m[1]:null;};
      const price=n(/"price"\\s*:\\s*(\\d{5,9})/);
      /* Taxes: prefer the most recent year of the listing's tax history,
         then the summary amount, then rate x price. */
      let tax=null;
      const th=T.match(/"taxHistory"\\s*:\\s*\\[(.*?)\\]/);
      if(th){try{
        const arr=JSON.parse('['+th[1]+']');
        let best=null;
        for(const e of arr){if(e&&e.taxPaid&&(!best||(e.time||0)>(best.time||0)))best=e;}
        if(best)tax=Math.round(best.taxPaid);
      }catch(err){}}
      if(!tax){
        const taxAmt=n(/"taxAnnualAmount"\\s*:\\s*(\\d{3,7})/);
        const taxRate=n(/"propertyTaxRate"\\s*:\\s*([\\d.]+)/);
        tax=taxAmt||(taxRate&&price?Math.round(price*taxRate/100):null);
      }
      /* HOA: several shapes across Zillow pages; missing means no HOA (0). */
      let hoa=n(/"monthlyHoaFee"\\s*:\\s*(\\d{1,5})/);
      if(hoa==null)hoa=n(/"hoaFee"\\s*:\\s*(\\d{1,5})/);
      if(hoa==null)hoa=n(/"hoaFee"[^}]{0,40}?"amount"\\s*:\\s*([\\d.]{1,7})/);
      if(hoa==null){const m=T.match(/"associationFee"\\s*:\\s*"\\$?([\\d,]{1,7})/);if(m)hoa=parseFloat(m[1].replace(/,/g,''));}
      const ins=n(/"annualHomeownersInsurance"\\s*:\\s*(\\d{2,6})/);
      const street=s(/"streetAddress"\\s*:\\s*"([^"]+)"/);
      const city=s(/"city"\\s*:\\s*"([^"]+)"/);
      const st=s(/"state"\\s*:\\s*"([A-Z]{2})"/);
      const zip=s(/"zipcode"\\s*:\\s*"(\\d{5})"/);
      const og=document.querySelector('meta[property="og:image"]');
      const data={
        address:street&&city?street+', '+city+', '+(st||'')+' '+(zip||''):document.title.split('|')[0].trim(),
        price:price,
        annualTaxes:tax,
        hoaMonthly:hoa!=null?Math.round(hoa):0,
        insMonthly:ins?Math.round(ins/12):null,
        bedrooms:n(/"bedrooms"\\s*:\\s*(\\d{1,2})/),bathrooms:n(/"bathrooms"\\s*:\\s*([\\d.]{1,4})/),
        livingArea:n(/"livingArea"\\s*:\\s*(\\d{3,6})/),yearBuilt:n(/"yearBuilt"\\s*:\\s*(\\d{4})/),
        photo:og?og.content:null,url:location.href.split('?')[0]};
      if(!data.price){alert('No listing price found on this page. Open a Zillow home-details page first, then click the bookmarklet.');return;}
      window.open('${location.origin}/import#'+encodeURIComponent(JSON.stringify(data)));
    })();`;
    return "javascript:" + code.replace(/\n\s*/g, "");
  }

  /* Consume an import handed off by the bookmarklet — on page load, and live
     via the storage event when another tab (the /import page) delivers one. */
  function consumePendingImport() {
    let raw;
    try { raw = localStorage.getItem("hpa_pending_import"); } catch (e) { return; }
    if (!raw) return;
    try {
      const { data } = JSON.parse(raw);
      localStorage.removeItem("hpa_pending_import");
      if (data && data.price) {
        applyListing(data);
        toast(`Imported ${data.address || "listing"} from Zillow.`);
        // Tell the /import popup it can close instead of opening a second
        // calculator tab that would fight this one over saved state.
        try { localStorage.setItem("hpa_import_ack", String(Date.now())); } catch (e2) {}
      }
    } catch (e) {
      localStorage.removeItem("hpa_pending_import");
    }
  }
  window.addEventListener("storage", (e) => {
    if (e.key === "hpa_pending_import" && e.newValue) consumePendingImport();
    // Keep multiple open calculator tabs in agreement: adopt state another
    // tab just saved so a stale tab can't overwrite a fresh import.
    if (e.key === HPA.STORAGE_KEY && e.newValue) {
      try {
        const fresh = JSON.parse(e.newValue);
        if (fresh && fresh.inputs && Array.isArray(fresh.scenarios)) {
          state = fresh;
          if (!Array.isArray(state.targets)) state.targets = [];
          if (!Array.isArray(state.recentProperties)) state.recentProperties = [];
          renderAll();
        }
      } catch (err) { /* ignore malformed writes */ }
    }
  });

  /* Saves */
  $("#btnSaves").addEventListener("click", async () => {
    openModal("savesModal");
    $("#saveName").value = state.client.name || state.property?.address || "";
    await refreshSaves();
  });
  $("#btnDoSave").addEventListener("click", async () => {
    const name = $("#saveName").value.trim();
    if (!name) { toast("Give the save a name first.", true); return; }
    const res = await fetch("/api/saves", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, state }),
    });
    if (res.ok) { toast(`Saved “${name}”.`); await refreshSaves(); }
    else toast("Save failed.", true);
  });
  async function refreshSaves() {
    const list = $("#savesList");
    list.innerHTML = `<div class="saves-empty">Loading…</div>`;
    try {
      const items = await (await fetch("/api/saves")).json();
      if (!items.length) { list.innerHTML = `<div class="saves-empty">No saved clients yet.</div>`; return; }
      list.innerHTML = "";
      items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "save-row";
        const date = it.savedAt ? new Date(it.savedAt).toLocaleDateString() : "";
        row.innerHTML = `
          <span class="sv-name">${HPA.esc(it.name)}</span>
          <span class="sv-date">${date}</span>
          <button class="btn btn-outline btn-sm act-load">Load</button>
          <button class="btn-icon act-rm" title="Delete">🗑</button>`;
        row.querySelector(".act-load").addEventListener("click", async () => {
          const entry = await (await fetch(`/api/saves/${encodeURIComponent(it.name)}`)).json();
          if (entry.state) {
            state = entry.state;
            if (!Array.isArray(state.targets)) state.targets = [];
            renderAll();
            closeModal("savesModal");
            toast(`Loaded “${it.name}”.`);
          }
        });
        row.querySelector(".act-rm").addEventListener("click", async () => {
          await fetch(`/api/saves/${encodeURIComponent(it.name)}`, { method: "DELETE" });
          await refreshSaves();
        });
        list.appendChild(row);
      });
    } catch (e) {
      list.innerHTML = `<div class="saves-empty">Couldn't load saves.</div>`;
    }
  }

  /* Report */
  $("#btnReport").addEventListener("click", () => {
    HPA.saveLocal(state);
    window.open("/report", "_blank");
  });

  /* New client — wipe the slate so the next client starts clean */
  $("#btnNewClient").addEventListener("click", () => openModal("newClientModal"));
  $("#btnConfirmNewClient").addEventListener("click", () => {
    state = HPA.defaultState();
    try { localStorage.removeItem("hpa_pending_import"); } catch (e) { /* storage unavailable */ }
    renderAll();
    closeModal("newClientModal");
    toast("Cleared — ready for a new client.");
  });

  /* Toast */
  let toastTimer;
  function toast(msg, isErr = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
  }

  consumePendingImport();
  renderAll();
})();
