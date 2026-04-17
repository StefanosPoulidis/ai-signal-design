// =============================================================
// AI Signal Design — diagnostic wizard
// Five-question screener → design-object recommendation
// =============================================================

(() => {
  "use strict";

  const questions = [
    {
      key: "action_logs",
      prompt: "Do you have reliable logs of the realized operator action at each signal epoch?",
      help: "The factored kernel requires deployment logs that record which action the operator actually took when a signal was issued — not just the signal-level and outcome.",
      options: [
        { value: "yes",    label: "Yes — action-at-signal is logged",              desc: "Electronic health record with action capture, annotated tutoring sessions, maintenance work orders with operator confirmation." },
        { value: "proxy",  label: "Partial — I have an ordered action proxy",       desc: "Could infer action from downstream state change but can't observe it directly." },
        { value: "no",     label: "No — I only see the signal and the final outcome", desc: "Observational data with no mid-epoch action observation." },
      ],
    },
    {
      key: "efficacy_proxy",
      prompt: "Do you have a state-level proxy for efficacy — the system's capacity to improve future decisions?",
      help: "Efficacy can be operator-side (fatigue, attention, skill retention) or algorithm-side (local model quality, coverage). You need an ordered proxy, not a perfect measurement.",
      options: [
        { value: "direct", label: "Yes — a credible ordered proxy exists",        desc: "Alert-dismiss rate, response latency, post-deployment accuracy, model uncertainty score." },
        { value: "weak",   label: "Weak — I have some signal but noise is high",  desc: "Proxy correlates with true efficacy but with substantial measurement error." },
        { value: "no",     label: "No — no efficacy construct is observable",     desc: "Only outcomes and signal-level are visible." },
      ],
    },
    {
      key: "drift_evidence",
      prompt: "Is there evidence that signaling shifts future efficacy, conditional on the realized action?",
      help: "This is efficacy drift — the channel that distinguishes dynamic signal design from standard policy optimization. Evidence can be experimental (A/B test of alert rates), quasi-experimental (cross-cohort variation), or calibrated from published rates.",
      options: [
        { value: "strong", label: "Strong — documented drift rate in my setting",       desc: "E.g., Li-Piri alert-fatigue estimate, post-automation skill decay study, known attention decay rate." },
        { value: "some",   label: "Some — plausible drift inferable from adjacent evidence", desc: "Literature on similar settings suggests drift exists but the magnitude isn't pinned down." },
        { value: "none",   label: "None — I have no reason to expect drift",             desc: "Signal-independent efficacy is plausible in this domain." },
      ],
    },
    {
      key: "cost_spec",
      prompt: "Can you specify cardinal downstream costs for every state-signal pair — not just relative upgrade costs?",
      help: "Direct SPD needs a full cost schedule B(x, ℓ). RD needs only an ordered intensity cost and relative upgrade judgments against silence. The former is much harder to defend credibly in most operational settings.",
      options: [
        { value: "full",     label: "Full — I can defend cardinal costs across all state-signal cells",   desc: "A structured audit or preference elicitation process has been done, or costs are directly monetary." },
        { value: "relative", label: "Relative only — I can rank upgrades against silence",                desc: "I can say 'a recommend signal at this state costs more than silence' but not by how much across states." },
        { value: "none",     label: "No — I can set a total-cost budget but not allocate it",             desc: "Organizational tolerance for alert fatigue / capability erosion exists at the aggregate level only." },
      ],
    },
    {
      key: "horizon",
      prompt: "How long is the deployment horizon relative to the response time of efficacy?",
      help: "Dynamic effects only matter if efficacy can meaningfully drift within the horizon you care about.",
      options: [
        { value: "long",   label: "Many decisions — drift can accumulate", desc: "Continuous clinical deployment, full-semester tutoring, multi-week maintenance cycle." },
        { value: "medium", label: "Moderate — some drift possible",         desc: "Weekly clinic, project-length trial." },
        { value: "short",  label: "Few decisions — drift won't compound",   desc: "One-off triage, single shift, single exam." },
      ],
    },
  ];

  const state = {
    answers: {},
    step: 0,
  };

  const $ = id => document.getElementById(id);

  function render() {
    // Progress dots
    const dots = $("progress-dots");
    dots.innerHTML = "";
    for (let i = 0; i <= questions.length; i++) {
      const d = document.createElement("div");
      d.className = "dot " + (i < state.step ? "done" : i === state.step ? "current" : "");
      dots.appendChild(d);
    }

    if (state.step < questions.length) {
      renderQuestion(questions[state.step]);
    } else {
      renderVerdict();
    }
  }

  function renderQuestion(q) {
    const body = $("wizard-body");
    body.innerHTML = "";
    const stepNum = document.createElement("div");
    stepNum.className = "step-num";
    stepNum.textContent = `Question ${state.step + 1} of ${questions.length}`;
    body.appendChild(stepNum);
    const h = document.createElement("h2");
    h.textContent = q.prompt;
    body.appendChild(h);
    const p = document.createElement("p");
    p.className = "q-prompt";
    p.textContent = q.help;
    body.appendChild(p);

    const opts = document.createElement("div");
    opts.className = "options";
    for (const o of q.options) {
      const b = document.createElement("button");
      b.className = "option";
      if (state.answers[q.key] === o.value) b.classList.add("selected");
      b.innerHTML = `<span class="opt-label">${o.label}</span><span class="opt-desc">${o.desc}</span>`;
      b.onclick = () => {
        state.answers[q.key] = o.value;
        render();
      };
      opts.appendChild(b);
    }
    body.appendChild(opts);

    const nav = document.createElement("div");
    nav.className = "wizard-nav";
    const back = document.createElement("button");
    back.className = "btn secondary";
    back.textContent = "← Back";
    back.disabled = state.step === 0;
    back.onclick = () => { if (state.step > 0) { state.step--; render(); } };
    nav.appendChild(back);

    const next = document.createElement("button");
    next.className = "btn";
    const isLast = state.step === questions.length - 1;
    next.textContent = isLast ? "See recommendation →" : "Next →";
    next.disabled = !state.answers[q.key];
    next.onclick = () => { state.step++; render(); };
    nav.appendChild(next);
    body.appendChild(nav);
  }

  function recommend(ans) {
    // Paper-aligned logic:
    // 1. Drift evidence — if none AND no proxy → Myopic regime (no design problem at all)
    // 2. Action logs — if missing, factored kernel isn't identifiable → Diagnostic only
    // 3. Horizon — if too short, continuation doesn't matter → Myopic
    // 4. Full cost spec → SPD; else relative only → RD; else diagnostic-only
    // 5. Weak proxy + strong drift → RD (order-preserving proxy is RD's natural regime)

    if (ans.drift_evidence === "none") {
      return {
        tag: "safe-harbor",
        title: "Safe harbor: myopic signaling",
        subtitle: "You are in the signal-independent-efficacy regime.",
        reasoning: [
          "You report no evidence that signals shift future efficacy. Under <em>signal-independent efficacy</em>, Proposition 3.3 shows the drift channel is absent.",
          "Dynamic signal design adds nothing over a well-designed myopic rule. A confidence-gated or accuracy-thresholded per-step rule is sufficient.",
          "Before shipping, run the near-tie screen (Proposition 3.4) to identify states where continuation effects could overturn myopic rankings if drift later emerges.",
        ],
      };
    }

    if (ans.horizon === "short") {
      return {
        tag: "short-horizon",
        title: "Short horizon: myopic signaling",
        subtitle: "Drift cannot compound within the decision horizon.",
        reasoning: [
          "Efficacy drift needs enough epochs to accumulate into a meaningful continuation effect. Your horizon is too short.",
          "Use a per-step greedy rule with a cost penalty tuned to overall tolerance.",
          "Revisit this diagnosis if the deployment expands to a longer horizon.",
        ],
      };
    }

    if (ans.action_logs === "no") {
      return {
        tag: "diagnostic-only",
        title: "Diagnostic use only — structural design not credible",
        subtitle: "The factored kernel requires action-at-signal identification.",
        reasoning: [
          "Without logs of the realized action at each signal epoch, the behavioral-response kernel μ and the efficacy kernel K cannot be separately identified.",
          "Running a direct SPD or RD policy would commit to a design whose primitives are not recoverable from your data. Proposition 3.1 (decision-insufficiency) applies.",
          "Short term: use the paper's diagnostics (IDE decomposition, near-tie screen) as an auditing tool over existing policies.",
          "Long term: introduce logging of action-at-signal, and/or design a randomized signal-intensity trial to identify K.",
        ],
      };
    }

    if (ans.efficacy_proxy === "no") {
      return {
        tag: "diagnostic-only",
        title: "Diagnostic use only — no efficacy construct",
        subtitle: "Efficacy is the state variable that makes the design problem dynamic.",
        reasoning: [
          "Without any ordered efficacy proxy, the design problem collapses to a non-dynamic one. You have no state-level variable to condition signaling on.",
          "Consider whether a proxy exists and was overlooked: alert-override rate, response latency, post-prediction accuracy, vigilance markers, or local model confidence.",
          "If none exists, myopic signaling is your only defensible option and the paper's framework cannot contribute beyond its diagnostic tools.",
        ],
      };
    }

    if (ans.cost_spec === "none") {
      return {
        tag: "diagnostic-only",
        title: "Diagnostic use only — cannot anchor constraint",
        subtitle: "Neither SPD nor RD is credibly specified without an upgrade-cost input.",
        reasoning: [
          "RD still needs ordered relative-upgrade judgments (Section 3.3). A global budget alone cannot anchor the shadow-price system.",
          "Work with stakeholders to produce at least relative upgrade rankings ('a recommend vs. silence at a typical state costs approximately X'), then re-run this diagnosis.",
          "In the meantime, operate myopically with an explicit aggregate cost cap.",
        ],
      };
    }

    // Both full-cost and relative-cost paths need drift to matter — if it doesn't, myopic suffices
    if (ans.drift_evidence === "some" && ans.cost_spec === "full" && ans.efficacy_proxy === "direct") {
      return {
        tag: "spd",
        title: "Direct Signal-Policy Design (SPD)",
        subtitle: "Use the full constrained formulation.",
        reasoning: [
          "You have action logs, an ordered efficacy proxy, documented drift, and a defensible full-cost schedule.",
          "Under these conditions, SPD is the oracle design object. Solve the constrained Markov decision process directly via the occupancy-measure LP (Section 2.1; Appendix C).",
          "Consider also running RD in parallel. The paper shows RD retains 97–99.7% of SPD's value in correctly-specified environments and is much less fragile under misspecification — it's a cheap robustness check.",
        ],
      };
    }

    if (ans.drift_evidence === "strong" && ans.cost_spec === "full" && ans.efficacy_proxy === "direct") {
      return {
        tag: "spd",
        title: "Direct Signal-Policy Design (SPD)",
        subtitle: "Use the full constrained formulation; drift is documented.",
        reasoning: [
          "You have strong drift evidence, action logs, an ordered efficacy proxy, and a full cost schedule. This is the regime where SPD is the oracle.",
          "Solve the constrained MDP via the occupancy-measure LP. Validate the policy with the IDE decomposition and the full-horizon performance guarantee (Proposition 3.5).",
          "Pair with an RD deployment as a robustness benchmark — RD is a nearly-costless hedge against cost-spec drift.",
        ],
      };
    }

    // RD recommendation: the general case
    const rdNotes = [];
    if (ans.cost_spec === "relative") rdNotes.push("Your cost-specification capacity is relative-only — precisely the regime RD is designed for.");
    if (ans.efficacy_proxy === "weak") rdNotes.push("Your efficacy proxy is noisy but order-preserving — RD's robustness to mismeasurement (Section 4.3) makes it the right object.");
    if (ans.drift_evidence === "strong") rdNotes.push("Strong drift evidence makes dynamic design essential; RD captures nearly all of SPD's value.");
    if (ans.drift_evidence === "some") rdNotes.push("Some drift evidence + partial specification places you in RD's natural regime.");

    return {
      tag: "rd",
      title: "Relative Design (RD)",
      subtitle: "Use the structured ordered-menu policy anchored at silence.",
      reasoning: [
        "RD is the constructive design object under partial specification. You don't need a cardinal cost schedule — only an ordered intensity index, an aggregate budget, and relative upgrade judgments.",
        ...rdNotes,
        "The optimal RD policy is an ordered-menu threshold rule with a single shadow price λ* (Theorem 3.1). Use the one-step approximation (Proposition 3.5) for a tractable deployment.",
        "Pair with the paper's diagnostics: the near-tie screen and the safe-harbor certificate let you audit where signaling decisions are fragile.",
      ],
    };
  }

  function renderVerdict() {
    const rec = recommend(state.answers);
    const body = $("wizard-body");
    body.innerHTML = "";

    const stepNum = document.createElement("div");
    stepNum.className = "step-num";
    stepNum.textContent = "Recommendation";
    body.appendChild(stepNum);

    const card = document.createElement("div");
    card.className = "verdict-card tag-" + rec.tag;
    card.innerHTML = `
      <div class="verdict-label">Recommended design object</div>
      <div class="verdict-title">${rec.title}</div>
      <div class="verdict-subtitle">${rec.subtitle}</div>
      <div class="verdict-reasoning">
        <ul>${rec.reasoning.map(r => `<li>${r}</li>`).join("")}</ul>
      </div>
    `;
    body.appendChild(card);

    // answer recap
    const recap = document.createElement("details");
    recap.className = "answer-recap";
    recap.innerHTML = `
      <summary>Your answers</summary>
      <ul>
        ${questions.map(q => {
          const a = state.answers[q.key];
          const opt = q.options.find(o => o.value === a);
          return `<li><strong>${q.prompt}</strong><br><span class="muted">${opt ? opt.label : "—"}</span></li>`;
        }).join("")}
      </ul>
    `;
    body.appendChild(recap);

    const nav = document.createElement("div");
    nav.className = "wizard-nav";
    const restart = document.createElement("button");
    restart.className = "btn secondary";
    restart.textContent = "← Start over";
    restart.onclick = () => { state.answers = {}; state.step = 0; render(); };
    nav.appendChild(restart);

    const toSim = document.createElement("a");
    toSim.className = "btn";
    toSim.href = "simulator.html";
    toSim.textContent = "Try the simulator →";
    nav.appendChild(toSim);

    body.appendChild(nav);
  }

  document.addEventListener("DOMContentLoaded", render);
})();
