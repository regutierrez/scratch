import { runFixtureSuite } from "./run";
import { scoreEntries } from "./report";

const fmt = (value: number | null) =>
  value === null ? "  —  " : value.toFixed(2).padStart(5);

const report = await runFixtureSuite((event) => {
  if (event.type === "status") console.error(`· ${event.message}`);
  if (event.type === "slot")
    console.error(
      `  [${event.done}/${event.total}] ${event.slot.id}  → ${fmt(event.slot.judgment.value)}`,
    );
});

console.log(`\n${report.benchmark.name}  (${report.mode} mode, @hona/openeval ${report.sdkVersion})\n`);
const width = Math.max(...report.benchmark.evals.map((e) => e.id.length), 5);
console.log(
  `${"eval".padEnd(width)}  ${report.benchmark.models.map((m) => m.padStart(24)).join("")}`,
);
for (const evalInfo of report.benchmark.evals)
  console.log(
    `${evalInfo.id.padEnd(width)}  ${report.benchmark.models
      .map((model) =>
        fmt(
          report.summary.cells.find(
            (cell) => cell.evalId === evalInfo.id && cell.model === model,
          )?.mean ?? null,
        ).padStart(24),
      )
      .join("")}`,
  );
console.log(
  `${"overall".padEnd(width)}  ${report.summary.models
    .map((model) => fmt(model.mean).padStart(24))
    .join("")}\n`,
);

for (const slot of report.slots) {
  console.log(`${slot.id}  value=${fmt(slot.judgment.value)}  evidence=${slot.evidence.hash.slice(0, 12)}`);
  for (const [id, score] of scoreEntries(slot.judgment))
    console.log(
      `    ${fmt(score.value)}  ${id.padEnd(24)} ${score.source}${
        slot.fixtureCriteria.includes(id) ? " (fixture)" : ""
      }`,
    );
}
console.log(
  `\n${report.summary.passed} passed · ${report.summary.failed} failed · ${report.summary.unresolved} unresolved · ${report.elapsedMs} ms`,
);
