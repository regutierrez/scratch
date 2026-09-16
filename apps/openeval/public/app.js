const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const state = { report: null, selected: null, filters: { eval: "", model: "" } };

const fmt = (value) => (value === null || value === undefined ? "—" : value.toFixed(2));
const pct = (value) => (value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`);
const shortModel = (model) => model.split("/").pop();
const tone = (value) =>
  value === null || value === undefined
    ? "tone-null"
    : value >= 0.999
      ? "tone-pass"
      : value >= 0.5
        ? "tone-mid"
        : "tone-fail";
const verdict = (judgment) =>
  judgment.value === null ? "unresolved" : judgment.value >= 0.999 ? "pass" : "fail";

function renderStats(report) {
  const s = report.summary;
  const cards = [
    ["Runs", s.slots, `${report.benchmark.evals.length} evals × ${report.benchmark.models.length} models × ${report.benchmark.repetitions} reps`],
    ["Passed", s.passed, "every criterion scored 1"],
    ["Failed", s.failed, "scored below 1"],
    ["Unresolved", s.unresolved, "a criterion returned null"],
    ["Mean score", fmt(s.mean), "across resolved runs"],
    ["Criteria", s.criteria, "judge.ts + judge.md"],
    ["Elapsed", `${report.elapsedMs} ms`, new Date(report.completedAt).toLocaleTimeString()],
  ];
  $("#stats").innerHTML = cards
    .map(
      ([label, value, hint]) => `
      <div class="stat">
        <span class="stat-label">${esc(label)}</span>
        <span class="stat-value">${esc(value)}</span>
        <span class="stat-hint muted small">${esc(hint)}</span>
      </div>`,
    )
    .join("");
}

function renderMatrix(report) {
  const { models, evals } = report.benchmark;
  const cell = (evalId, model) =>
    report.summary.cells.find((c) => c.evalId === evalId && c.model === model);
  const head = `<tr><th>eval</th>${models
    .map((m) => `<th title="${esc(m)}">${esc(shortModel(m))}</th>`)
    .join("")}</tr>`;
  const rows = evals
    .map(
      (e) => `<tr>
        <th class="row-head"><span class="eval-id">${esc(e.id)}</span><span class="muted small">${esc(e.name)}</span></th>
        ${models
          .map((m) => {
            const c = cell(e.id, m);
            return `<td><button class="cell ${tone(c?.mean)}" data-eval="${esc(e.id)}" data-model="${esc(m)}">
              <span class="cell-value">${fmt(c?.mean ?? null)}</span>
              <span class="cell-sub">${c?.unresolved ? `${c.unresolved} unresolved` : `${c?.slots ?? 0} runs`}</span>
            </button></td>`;
          })
          .join("")}
      </tr>`,
    )
    .join("");
  const totals = `<tr class="totals"><th class="row-head">overall</th>${report.summary.models
    .map(
      (m) =>
        `<td><div class="cell total ${tone(m.mean)}"><span class="cell-value">${fmt(m.mean)}</span><span class="cell-sub">${m.passed}/${m.slots} passed</span></div></td>`,
    )
    .join("")}</tr>`;
  $("#matrix").innerHTML = head + rows + totals;
  $("#matrix").querySelectorAll("button.cell").forEach((button) =>
    button.addEventListener("click", () => {
      state.filters = { eval: button.dataset.eval, model: button.dataset.model };
      $("#filter-eval").value = state.filters.eval;
      $("#filter-model").value = state.filters.model;
      renderSlots(state.report);
    }),
  );
}

function renderFilters(report) {
  const fill = (select, values, current) => {
    const first = select.options[0].outerHTML;
    select.innerHTML =
      first + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    select.value = current;
  };
  fill($("#filter-eval"), report.benchmark.evals.map((e) => e.id), state.filters.eval);
  fill($("#filter-model"), report.benchmark.models, state.filters.model);
}

function renderSlots(report) {
  const slots = report.slots.filter(
    (s) =>
      (!state.filters.eval || s.evalId === state.filters.eval) &&
      (!state.filters.model || s.model === state.filters.model),
  );
  $("#slots").innerHTML = slots
    .map((s) => {
      const v = verdict(s.judgment);
      return `<li>
        <button class="slot ${s.id === state.selected ? "selected" : ""}" data-id="${esc(s.id)}">
          <span class="pill ${v}">${v}</span>
          <span class="slot-main">
            <span class="slot-title">${esc(s.evalId)} <span class="muted">·</span> ${esc(shortModel(s.model))} <span class="muted">· r${s.repetition}</span></span>
            <span class="slot-sub muted small">${Object.keys(s.judgment.scores).length} criteria · ${s.tools.length} tool call${s.tools.length === 1 ? "" : "s"} · ${s.elapsedMs} ms</span>
          </span>
          <span class="slot-score ${tone(s.judgment.value)}">${fmt(s.judgment.value)}</span>
        </button>
      </li>`;
    })
    .join("");
  $("#slots").querySelectorAll("button.slot").forEach((button) =>
    button.addEventListener("click", () => select(button.dataset.id)),
  );
  if (!slots.some((s) => s.id === state.selected) && slots[0]) select(slots[0].id);
}

function select(id) {
  state.selected = id;
  $("#slots").querySelectorAll("button.slot").forEach((b) =>
    b.classList.toggle("selected", b.dataset.id === id),
  );
  const slot = state.report.slots.find((s) => s.id === id);
  if (slot) renderDetail(slot);
}

function scoreRow(id, score, slot, evalInfo) {
  const criterion = evalInfo.criteria.find((c) => c.id === id);
  const fixture = slot.fixtureCriteria.includes(id);
  const citations = (score.evidence ?? [])
    .map((c) =>
      c.quote
        ? `<q class="cite" title="${esc(c.kind)} citation, verified against the recording">${esc(c.quote)}</q>`
        : `<span class="cite-kind">${esc(c.kind)}${c.id ? `:${esc(c.id)}` : ""}</span>`,
    )
    .join(" ");
  return `<tr>
    <td class="score ${tone(score.value)}">${fmt(score.value)}</td>
    <td>
      <div class="crit-id">${esc(id)}</div>
      ${criterion ? `<div class="muted small">${esc(criterion.name)}</div>` : ""}
    </td>
    <td><span class="src src-${score.source === "judge.ts" ? "code" : "rubric"}">${esc(score.source)}</span>${fixture ? `<span class="src src-fixture" title="Authored in fixtures/candidates.ts; a live run asks the judge model">fixture</span>` : ""}</td>
    <td class="reason">${esc(score.reason)}<div class="cites">${citations}</div></td>
  </tr>`;
}

function renderTools(slot) {
  if (!slot.tools.length)
    return `<p class="muted small">No tool calls in this recording.</p>`;
  const t0 = Math.min(...slot.tools.map((t) => t.startedAt ?? 0));
  return `<ol class="trace">${slot.tools
    .map(
      (t) => `<li class="trace-item ${esc(t.status)}">
        <div class="trace-head">
          <span class="pill ${t.status === "succeeded" ? "pass" : t.status === "failed" ? "fail" : "unresolved"}">${esc(t.status)}</span>
          <code class="tool-name">${esc(t.name)}</code>
          <span class="muted small">+${(t.startedAt ?? t0) - t0} ms · ${t.durationMs ?? "?"} ms · ${esc(t.id)}</span>
        </div>
        <pre class="code small">${esc(JSON.stringify(t.input ?? {}, null, 2))}</pre>
        <pre class="code small ${t.status === "failed" ? "err" : ""}">${esc(
          typeof (t.content ?? t.error) === "string"
            ? t.content ?? t.error
            : JSON.stringify(t.content ?? t.error ?? null, null, 2),
        )}</pre>
      </li>`,
    )
    .join("")}</ol>`;
}

function renderDetail(slot) {
  const report = state.report;
  const evalInfo = report.benchmark.evals.find((e) => e.id === slot.evalId);
  const v = verdict(slot.judgment);
  const m = slot.metrics.tools;
  $("#detail").innerHTML = `
    <div class="detail-head">
      <div>
        <div class="crumbs muted small">${esc(report.benchmark.name)} / ${esc(slot.evalId)} / ${esc(slot.model)} / repetition ${slot.repetition}</div>
        <h2>${esc(evalInfo?.name ?? slot.evalId)}</h2>
        <p class="muted">${esc(slot.judgment.reason)}${slot.error ? ` <span class="err">${esc(slot.error)}</span>` : ""}</p>
      </div>
      <div class="verdict ${v}">
        <span class="verdict-value">${fmt(slot.judgment.value)}</span>
        <span class="verdict-label">${v}</span>
      </div>
    </div>

    <div class="detail-grid">
      <section>
        <h3>Criterion scores</h3>
        <table class="scores">
          <thead><tr><th>score</th><th>criterion</th><th>source</th><th>reason &amp; evidence</th></tr></thead>
          <tbody>${Object.entries(slot.judgment.scores)
            .map(([id, score]) => scoreRow(id, score, slot, evalInfo))
            .join("")}</tbody>
        </table>
        <p class="muted small">
          ${slot.citations.verified
            ? "✓ every citation quote was found in the recording (verifyJudgmentEvidence)."
            : `✗ citation check failed: ${esc(slot.citations.error)}`}
        </p>

        <h3>Candidate response</h3>
        <pre class="code response">${esc(slot.response)}</pre>

        <h3>Prompt</h3>
        <pre class="code">${esc(slot.prompt)}</pre>
      </section>

      <section>
        <h3>Tool-call trace <span class="muted small">${m.calls} calls · ${m.succeeded} ok · ${m.failed} failed</span></h3>
        ${renderTools(slot)}

        <h3>Evidence archive</h3>
        <dl class="kv">
          <dt>sha256</dt><dd><code>${esc(slot.evidence.hash)}</code></dd>
          <dt>directory</dt><dd><code>${esc(slot.evidence.directory.replace(report.benchmark.directory.replace(/\/benchmark$/, ""), "."))}</code></dd>
          <dt>state</dt><dd>${esc(slot.state)} · ${slot.elapsedMs} ms</dd>
        </dl>

        ${slot.code
          ? `<h3>judge.ts execution <span class="muted small">${esc(slot.code.state)} · ${slot.code.elapsedMs} ms · source ${esc(slot.code.sourceHash.slice(0, 12))}</span></h3>
             <details open><summary>Raw output (before boolean normalization)</summary>
               <pre class="code small">${esc(JSON.stringify(slot.code.output, null, 2))}</pre></details>
             ${slot.code.stdout.trim() ? `<details><summary>stdout</summary><pre class="code small">${esc(slot.code.stdout)}</pre></details>` : ""}
             ${slot.code.stderr.trim() ? `<details><summary>stderr</summary><pre class="code small err">${esc(slot.code.stderr)}</pre></details>` : ""}
             ${slot.code.error ? `<p class="err">${esc(slot.code.error)}</p>` : ""}`
          : ""}

        <h3>Definitions</h3>
        ${evalInfo?.rubric ? `<details><summary>judge.md</summary><pre class="code small">${esc(evalInfo.rubric)}</pre></details>` : ""}
        ${evalInfo?.judgeSource ? `<details><summary>judge.ts</summary><pre class="code small">${esc(evalInfo.judgeSource)}</pre></details>` : ""}
      </section>
    </div>`;
}

function renderReport(report) {
  state.report = report;
  $("#empty").classList.add("hidden");
  $("#results").classList.remove("hidden");
  $("#benchmark-line").textContent = `${report.benchmark.name} · ${report.benchmark.models.length} models · judge ${report.benchmark.judgeModel ?? "none"} · run ${report.id}`;
  $("#sdk-version").textContent = `@hona/openeval ${report.sdkVersion}`;
  renderStats(report);
  renderMatrix(report);
  renderFilters(report);
  renderSlots(report);
}

async function loadLatest() {
  const response = await fetch("/api/report");
  if (response.ok) renderReport(await response.json());
  else $("#benchmark-line").textContent = "No run recorded yet";
}

function startRun() {
  const button = $("#run-button");
  button.disabled = true;
  const progress = $("#progress"),
    log = $("#progress-log"),
    bar = $("#progress-bar");
  progress.classList.remove("hidden");
  log.textContent = "";
  bar.style.width = "0%";
  $("#progress-title").textContent = "Running fixture suite…";
  $("#progress-count").textContent = "";
  const source = new EventSource("/api/run");
  const append = (line) => {
    log.textContent += line + "\n";
    log.scrollTop = log.scrollHeight;
  };
  source.addEventListener("status", (e) => append(`· ${JSON.parse(e.data).message}`));
  source.addEventListener("slot", (e) => {
    const { slot, done, total } = JSON.parse(e.data);
    append(`  [${done}/${total}] ${slot.id} → ${fmt(slot.judgment.value)} (${verdict(slot.judgment)})`);
    bar.style.width = `${Math.round((done / total) * 100)}%`;
    $("#progress-count").textContent = `${done} / ${total}`;
  });
  source.addEventListener("report", (e) => {
    const { report } = JSON.parse(e.data);
    $("#progress-title").textContent = `Completed in ${report.elapsedMs} ms`;
    renderReport(report);
    finish();
  });
  source.addEventListener("error", (e) => {
    if (e.data) append(`✗ ${JSON.parse(e.data).message}`);
    finish();
  });
  function finish() {
    source.close();
    button.disabled = false;
    setTimeout(() => progress.classList.add("hidden"), 2500);
  }
}

$("#run-button").addEventListener("click", startRun);
$("#filter-eval").addEventListener("change", (e) => {
  state.filters.eval = e.target.value;
  renderSlots(state.report);
});
$("#filter-model").addEventListener("change", (e) => {
  state.filters.model = e.target.value;
  renderSlots(state.report);
});

loadLatest();
