// =============================================================
// AI Signal Design — interactive simulator
// Pedagogical DP engine comparing Myopic / Dynamic-Optimal / RD
// under varying efficacy-drift intensity and cost misspecification.
// =============================================================

(() => {
  "use strict";

  // ---------- model constants ----------
  const C = 5;                    // efficacy classes (0..4)
  const L = 4;                    // signal levels (0=silent .. 3=solve)
  const T = 20;                   // horizon
  const C0 = 2;                   // initial efficacy = middle (uniform baseline)

  const SIGNAL_LABELS = ["Silent", "Hint", "Recommend", "Solve"];
  const LIFT = [0, 0.30, 0.55, 0.80];       // signal lift (diminishing)
  const COST_BASE = [0, 1.0, 2.0, 3.5];     // per-step signal cost

  const base = c => 0.08 + 0.80 * (c / (C - 1));
  const reward = (c, ell) => base(c) + (1 - base(c)) * LIFT[ell];

  // Per-step drift: stronger signals push efficacy down (linear in intensity),
  // silence allows slow recovery.
  function transition(c, ell, betaD) {
    const inten = ell / (L - 1);
    const down = c > 0 ? betaD * inten : 0;
    const up = c < C - 1 ? 0.10 * (1 - inten) : 0;
    const stay = 1 - down - up;
    return { down, stay, up };
  }

  // True state-dependent cost: signals cost more when efficacy is low (fatigue, overload).
  const TRUE_STATE_SENS = 0.60;
  function costTrue(c, ell) {
    return COST_BASE[ell] * (1 + TRUE_STATE_SENS * (1 - c / (C - 1)));
  }
  // SPD planner's (possibly misspecified) belief — misspec in [-1, 1]
  function costSPD(c, ell, misspec) {
    return COST_BASE[ell] * (1 + (TRUE_STATE_SENS + misspec) * (1 - c / (C - 1)));
  }
  // RD planner uses intensity only — invariant to state misspec
  function costRD(c, ell) {
    return COST_BASE[ell];
  }

  // ---------- DP engine ----------
  // dpPolicy(opts) -> { policy[t][c], V[t][c] }
  //   lambda: dual multiplier on cost
  //   betaD: drift intensity
  //   costFn: (c, ell) -> scalar
  //   useContinuation: true = full DP; false = myopic (per-step only)
  function dpPolicy({ lambda, betaD, costFn, useContinuation }) {
    const V = Array.from({ length: T + 1 }, () => Array(C).fill(0));
    const policy = Array.from({ length: T }, () => Array(C).fill(0));
    for (let t = T - 1; t >= 0; t--) {
      for (let c = 0; c < C; c++) {
        let bestQ = -Infinity, bestEll = 0;
        for (let ell = 0; ell < L; ell++) {
          const { down, stay, up } = transition(c, ell, betaD);
          let Vnext = 0;
          if (useContinuation) {
            const cDown = Math.max(0, c - 1);
            const cUp = Math.min(C - 1, c + 1);
            Vnext = down * V[t + 1][cDown] + up * V[t + 1][cUp] + stay * V[t + 1][c];
          }
          const Q = reward(c, ell) - lambda * costFn(c, ell) + Vnext;
          if (Q > bestQ) { bestQ = Q; bestEll = ell; }
        }
        V[t][c] = bestQ;
        policy[t][c] = bestEll;
      }
    }
    return { V, policy };
  }

  // Forward evaluation using occupancy propagation — returns trajectories.
  // Always evaluated under TRUE dynamics and TRUE cost.
  function evaluate(policy, betaD) {
    let occ = Array(C).fill(0);
    occ[C0] = 1;
    const cumR = [], cumB = [], expC = [];
    let accR = 0, accB = 0;
    for (let t = 0; t < T; t++) {
      let stepR = 0, stepB = 0, stepEC = 0;
      const newOcc = Array(C).fill(0);
      for (let c = 0; c < C; c++) {
        const w = occ[c];
        if (w < 1e-14) continue;
        const ell = policy[t][c];
        const { down, stay, up } = transition(c, ell, betaD);
        stepR += w * reward(c, ell);
        stepB += w * costTrue(c, ell);
        stepEC += w * c;
        newOcc[Math.max(0, c - 1)] += w * down;
        newOcc[Math.min(C - 1, c + 1)] += w * up;
        newOcc[c] += w * stay;
      }
      occ = newOcc;
      accR += stepR;
      accB += stepB;
      cumR.push(accR);
      cumB.push(accB);
      expC.push(stepEC);
    }
    return { cumR, cumB, expC, totalR: accR, totalB: accB };
  }

  // Occupancy-weighted expected cost under an ARBITRARY cost function (for planner-belief tuning)
  function evaluateCost(policy, betaD, costFn) {
    let occ = Array(C).fill(0);
    occ[C0] = 1;
    let acc = 0;
    for (let t = 0; t < T; t++) {
      const newOcc = Array(C).fill(0);
      for (let c = 0; c < C; c++) {
        const w = occ[c];
        if (w < 1e-14) continue;
        const ell = policy[t][c];
        const { down, stay, up } = transition(c, ell, betaD);
        acc += w * costFn(c, ell);
        newOcc[Math.max(0, c - 1)] += w * down;
        newOcc[Math.min(C - 1, c + 1)] += w * up;
        newOcc[c] += w * stay;
      }
      occ = newOcc;
    }
    return acc;
  }

  // Bisect lambda and return the two boundary policies with a mixing weight so that
  // the EXPECTED cumulative cost — measured under the PLANNER's costFn — matches the budget.
  // This is the faithful CMDP formulation: the planner uses its own (possibly misspecified)
  // cost object. Realized true cost may differ from the budget; that deviation is part of
  // the misspecification cost shown by the simulator.
  function tuneLambda({ betaD, budget, costFn, useContinuation }) {
    // Policy is planned with costFn (planner's belief) but the budget is defined on TRUE cost.
    // Unconstrained (λ=0): if unconstrained policy already fits true budget, no mixing needed.
    const polZero = dpPolicy({ lambda: 0, betaD, costFn, useContinuation }).policy;
    const trueZero = evaluate(polZero, betaD).totalB;
    if (trueZero <= budget + 1e-9) {
      const evZero = evaluate(polZero, betaD);
      return { lambda: 0, policyLo: polZero, policyHi: polZero, alpha: 0, evalLo: evZero, evalHi: evZero };
    }
    // Bisect on TRUE cost (all policies compete at the same realized budget).
    let lo = 0, hi = 40;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const { policy } = dpPolicy({ lambda: mid, betaD, costFn, useContinuation });
      const trueB = evaluate(policy, betaD).totalB;
      if (trueB > budget) lo = mid; else hi = mid;
    }
    const polLo = dpPolicy({ lambda: lo, betaD, costFn, useContinuation }).policy;
    const polHi = dpPolicy({ lambda: hi, betaD, costFn, useContinuation }).policy;
    const evLo = evaluate(polLo, betaD);
    const evHi = evaluate(polHi, betaD);
    const denom = evLo.totalB - evHi.totalB;
    let alpha;
    if (Math.abs(denom) < 1e-9) {
      alpha = 0;
    } else {
      alpha = (budget - evHi.totalB) / denom;
      alpha = Math.max(0, Math.min(1, alpha));
    }
    return { lambda: (lo + hi) / 2, policyLo: polLo, policyHi: polHi, alpha, evalLo: evLo, evalHi: evHi };
  }

  // Mix two trajectory results under weight α on "lo" side.
  function mixResults(evalLo, evalHi, alpha) {
    const mix = (a, b) => a.map((v, i) => alpha * v + (1 - alpha) * b[i]);
    return {
      cumR: mix(evalLo.cumR, evalHi.cumR),
      cumB: mix(evalLo.cumB, evalHi.cumB),
      expC: mix(evalLo.expC, evalHi.expC),
      totalR: alpha * evalLo.totalR + (1 - alpha) * evalHi.totalR,
      totalB: alpha * evalLo.totalB + (1 - alpha) * evalHi.totalB,
    };
  }

  // ---------- three policies ----------
  // All policies compete at the same budget. SPD/RD use randomization at λ-boundaries
  // (standard CMDP mixed-policy); myopic uses the paper's linear-cost-gating (LCG) rule —
  // a per-step greedy policy driven by the SAME shadow price λ that SPD would face if it
  // knew continuation effects, but WITHOUT using continuation information. Myopic's realized
  // cost may over- or under-shoot the budget; we also attempt mixing to respect budget.
  function solveAll({ betaD, budget, misspec }) {
    const costSpd = (c, ell) => costSPD(c, ell, misspec);
    const spdTune = tuneLambda({ betaD, budget, costFn: costSpd, useContinuation: true });
    const rdTune = tuneLambda({ betaD, budget, costFn: costRD, useContinuation: true });

    // Myopic: per-step greedy at each state, tuned via its own mixed-policy budget match
    // using useContinuation=false (no look-ahead). This is the "LCG" myopic benchmark.
    const myTune = tuneLambda({ betaD, budget, costFn: costTrue, useContinuation: false });

    const pack = (tune) => ({
      policyLo: tune.policyLo,
      policyHi: tune.policyHi,
      alpha: tune.alpha,
      lam: tune.lambda,
      result: mixResults(tune.evalLo, tune.evalHi, tune.alpha),
    });

    return { myopic: pack(myTune), spd: pack(spdTune), rd: pack(rdTune) };
  }

  // ---------- rendering ----------
  const $ = id => document.getElementById(id);

  const scenarios = {
    custom:   { label: "Custom",                                betaD: 0.20, budget: 14, misspec: 0.00 },
    lowdrift: { label: "Hospital alert fatigue (low drift)",    betaD: 0.05, budget: 18, misspec: 0.00 },
    midrift:  { label: "Ambulatory CDS (boundary drift)",       betaD: 0.20, budget: 14, misspec: 0.00 },
    cmapss:   { label: "C-MAPSS turbofan (high drift)",         betaD: 0.45, budget: 10, misspec: 0.00 },
    misspec:  { label: "Misspecified cost (high drift)",        betaD: 0.45, budget: 10, misspec: 0.60 },
  };

  const state = {
    betaD: 0.20,
    budget: 14,
    misspec: 0.00,
    solution: null,
    charts: {},
  };

  function fmt(x, d=2) { return Number(x).toFixed(d); }
  function pct(x, d=1) { return (100 * x).toFixed(d) + "%"; }

  function render() {
    state.solution = solveAll(state);
    renderKPIs();
    renderChartReward();
    renderChartCost();
    renderChartEfficacy();
    renderPolicyHeatmap();
    renderDiagnostic();
  }

  function renderKPIs() {
    const { myopic, spd, rd } = state.solution;
    const best = Math.max(myopic.result.totalR, spd.result.totalR, rd.result.totalR);
    const ref = myopic.result.totalR;
    $("kpi-my-val").textContent = fmt(myopic.result.totalR);
    $("kpi-rd-val").textContent = fmt(rd.result.totalR);
    $("kpi-spd-val").textContent = fmt(spd.result.totalR);
    $("kpi-my-gain").textContent = "baseline";
    $("kpi-rd-gain").textContent = "+" + pct((rd.result.totalR - ref) / ref);
    $("kpi-spd-gain").textContent = "+" + pct((spd.result.totalR - ref) / ref);

    // retention: RD / SPD of their gains over myopic
    const rdGain = rd.result.totalR - ref;
    const spdGain = spd.result.totalR - ref;
    const retention = spdGain > 1e-6 ? rdGain / spdGain : 1;
    $("retention-val").textContent =
      spdGain > 0.01 ? pct(Math.min(1, Math.max(0, retention)), 1) : "—";
  }

  function mkChart(canvasId, datasets, { yLabel, xLabel = "Epoch t", extraOpts = {} }) {
    const ctx = $(canvasId).getContext("2d");
    if (state.charts[canvasId]) state.charts[canvasId].destroy();
    const labels = Array.from({ length: T }, (_, i) => i + 1);
    state.charts[canvasId] = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y, 2)}` } },
        },
        scales: {
          x: { title: { display: true, text: xLabel, color: "#6b7689" }, grid: { display: false }, ticks: { color: "#6b7689" } },
          y: { title: { display: true, text: yLabel, color: "#6b7689" }, grid: { color: "#e3e6ed" }, ticks: { color: "#6b7689" } },
        },
        ...extraOpts,
      },
    });
  }

  const STYLES = {
    myopic: { color: "#6b7689", label: "Myopic" },
    rd:     { color: "#1f477a", label: "RD" },
    spd:    { color: "#b5431f", label: "SPD" },
  };

  function renderChartReward() {
    const { myopic, spd, rd } = state.solution;
    mkChart("chart-reward", [
      { label: "Myopic", data: myopic.result.cumR, borderColor: STYLES.myopic.color, backgroundColor: STYLES.myopic.color, borderWidth: 2, tension: 0.25, pointRadius: 0 },
      { label: "RD",     data: rd.result.cumR,     borderColor: STYLES.rd.color,     backgroundColor: STYLES.rd.color,     borderWidth: 2, tension: 0.25, pointRadius: 0 },
      { label: "SPD",    data: spd.result.cumR,    borderColor: STYLES.spd.color,    backgroundColor: STYLES.spd.color,    borderWidth: 2.4, tension: 0.25, pointRadius: 0 },
    ], { yLabel: "Cumulative reward" });
  }

  function renderChartCost() {
    const { myopic, spd, rd } = state.solution;
    const budgetLine = Array(T).fill(state.budget);
    mkChart("chart-cost", [
      { label: "Myopic", data: myopic.result.cumB, borderColor: STYLES.myopic.color, borderWidth: 2, tension: 0.25, pointRadius: 0 },
      { label: "RD",     data: rd.result.cumB,     borderColor: STYLES.rd.color,     borderWidth: 2, tension: 0.25, pointRadius: 0 },
      { label: "SPD",    data: spd.result.cumB,    borderColor: STYLES.spd.color,    borderWidth: 2.4, tension: 0.25, pointRadius: 0 },
      { label: "Budget", data: budgetLine,         borderColor: "#a3301e", borderWidth: 1.2, borderDash: [6,4], pointRadius: 0, fill: false },
    ], { yLabel: "Cumulative cost" });
  }

  function renderChartEfficacy() {
    const { myopic, spd, rd } = state.solution;
    mkChart("chart-efficacy", [
      { label: "Myopic", data: myopic.result.expC, borderColor: STYLES.myopic.color, borderWidth: 2, tension: 0.25, pointRadius: 0 },
      { label: "RD",     data: rd.result.expC,     borderColor: STYLES.rd.color,     borderWidth: 2, tension: 0.25, pointRadius: 0 },
      { label: "SPD",    data: spd.result.expC,    borderColor: STYLES.spd.color,    borderWidth: 2.4, tension: 0.25, pointRadius: 0 },
    ], { yLabel: "Expected efficacy E[c]",
         extraOpts: { scales: { y: { min: 0, max: C - 1, title: { display: true, text: "Expected efficacy E[c]", color: "#6b7689" } } } }
    });
  }

  // Policy heatmap: state (rows) × time (cols) → mixed signal level (alpha * ell_lo + (1-alpha) * ell_hi)
  function renderPolicyHeatmap() {
    const container = $("policy-heatmaps");
    container.innerHTML = "";
    const policies = [
      { key: "myopic", title: "Myopic" },
      { key: "rd",     title: "RD" },
      { key: "spd",    title: "SPD" },
    ];
    for (const { key, title } of policies) {
      const sol = state.solution[key];
      const { policyLo, policyHi, alpha } = sol;
      const div = document.createElement("div");
      div.className = "policy-map";
      const h = document.createElement("h5");
      h.textContent = title + (alpha > 0.02 && alpha < 0.98 ? ` · mixed (α=${fmt(alpha, 2)})` : "");
      div.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "pmap-grid";
      grid.style.gridTemplateColumns = `auto repeat(${T}, 1fr)`;
      grid.appendChild(cell("", "pmap-corner"));
      for (let t = 0; t < T; t++) grid.appendChild(cell(String(t+1), "pmap-hdr"));
      for (let c = C - 1; c >= 0; c--) {
        grid.appendChild(cell(`c=${c}`, "pmap-rowhdr"));
        for (let t = 0; t < T; t++) {
          const ellLo = policyLo[t][c];
          const ellHi = policyHi[t][c];
          const ellMix = alpha * ellLo + (1 - alpha) * ellHi;
          const cellEl = mixCell(ellMix);
          cellEl.title = ellLo === ellHi
            ? `t=${t+1}, c=${c} → ${SIGNAL_LABELS[ellLo]}`
            : `t=${t+1}, c=${c} → mix(${SIGNAL_LABELS[ellLo]}, ${SIGNAL_LABELS[ellHi]}), α=${fmt(alpha,2)}`;
          grid.appendChild(cellEl);
        }
      }
      div.appendChild(grid);
      container.appendChild(div);
    }
  }

  // Cell shaded by continuous signal intensity ∈ [0, 3]
  function mixCell(ellMix) {
    const d = document.createElement("div");
    d.className = "pmap-cell";
    const t = ellMix / (L - 1);  // 0..1
    // interpolate: silent (#eef1f5) -> hint (#c5d4e3) -> recommend (#8fa9c7) -> solve (#b5431f)
    const stops = [
      [0.00, [238, 241, 245]],
      [0.33, [197, 212, 227]],
      [0.67, [143, 169, 199]],
      [1.00, [181, 67, 31]],
    ];
    let rgb;
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [a0, c0] = stops[i-1];
        const [a1, c1] = stops[i];
        const u = (t - a0) / (a1 - a0);
        rgb = c0.map((v, k) => Math.round(v + u * (c1[k] - v)));
        break;
      }
    }
    if (!rgb) rgb = stops[stops.length - 1][1];
    d.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    return d;
  }

  function cell(text, cls, ell) {
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    if (ell !== undefined) {
      d.classList.add(`pmap-ell${ell}`);
    }
    return d;
  }

  function renderDiagnostic() {
    const { myopic, spd, rd } = state.solution;
    const rGain = rd.result.totalR - myopic.result.totalR;
    const sGain = spd.result.totalR - myopic.result.totalR;
    const rGainPct = rGain / myopic.result.totalR;
    const sGainPct = sGain / myopic.result.totalR;
    const rdVsSpd = rd.result.totalR - spd.result.totalR;
    const relRDvsSPD = spd.result.totalR > myopic.result.totalR + 1e-6
      ? rGain / sGain
      : 1;

    let verdict, detail, tone;
    if (Math.max(sGainPct, rGainPct) < 0.012) {
      verdict = "Low drift — myopic is effectively sufficient.";
      detail = `Dynamic design gains only ${pct(Math.max(sGainPct, rGainPct), 2)} here. The paper's low-drift result: a simple per-step rule is operationally adequate.`;
      tone = "safe";
    } else if (rdVsSpd > 0.02) {
      verdict = "Misspecification regime — RD ≥ plug-in SPD.";
      detail = `RD's intensity-only restriction survives the cost-misspecification; plug-in SPD's state-dependent penalty is shifted by the misspec slider. The paper's Regime 3.`;
      tone = "hot";
    } else {
      verdict = "Material drift — dynamic design matters, RD retains SPD's value.";
      detail = `SPD beats myopic by ${pct(sGainPct, 2)}; RD retains ${pct(Math.max(0, Math.min(1, relRDvsSPD)), 1)} with only an ordered-intensity cost input. This is the paper's headline result.`;
      tone = "mid";
    }

    const el = $("diag-verdict");
    el.className = "diag-verdict tone-" + tone;
    el.innerHTML = `<strong>${verdict}</strong><div class="diag-detail">${detail}</div>`;
  }

  // ---------- controls ----------
  function setupControls() {
    const slBeta = $("ctrl-beta");
    const slBudget = $("ctrl-budget");
    const slMiss = $("ctrl-misspec");
    const selScenario = $("ctrl-scenario");

    function syncFromState() {
      slBeta.value = state.betaD;
      slBudget.value = state.budget;
      slMiss.value = state.misspec;
      $("val-beta").textContent = fmt(state.betaD, 2);
      $("val-budget").textContent = fmt(state.budget, 1);
      $("val-misspec").textContent = (state.misspec >= 0 ? "+" : "") + fmt(state.misspec * 100, 0) + "%";
    }

    slBeta.addEventListener("input", () => {
      state.betaD = parseFloat(slBeta.value);
      selScenario.value = "custom";
      syncFromState(); render();
    });
    slBudget.addEventListener("input", () => {
      state.budget = parseFloat(slBudget.value);
      selScenario.value = "custom";
      syncFromState(); render();
    });
    slMiss.addEventListener("input", () => {
      state.misspec = parseFloat(slMiss.value);
      selScenario.value = "custom";
      syncFromState(); render();
    });
    selScenario.addEventListener("change", () => {
      const s = scenarios[selScenario.value];
      state.betaD = s.betaD;
      state.budget = s.budget;
      state.misspec = s.misspec;
      syncFromState(); render();
    });

    syncFromState();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupControls();
    render();
  });
})();
