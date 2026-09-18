import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  criterionMean,
  judgeEvidence,
  loadBenchmark,
  recordEvidence,
  verifyJudgmentEvidence,
  type CriterionScore,
  type Judgment,
} from "@hona/openeval";
import { fixtures, type FixtureSlot } from "../fixtures/candidates";
import {
  summarize,
  type EvalInfo,
  type ProgressEvent,
  type RunReport,
  type SlotResult,
} from "./report";

export const APP_ROOT = resolve(import.meta.dir, "..");
export const BENCHMARK_DIR = resolve(APP_ROOT, "benchmark");
export const RESULTS_DIR = resolve(APP_ROOT, "results");
export const LATEST_REPORT = resolve(RESULTS_DIR, "latest.json");

const sdkVersion = async () =>
  ((await Bun.file(
    resolve(APP_ROOT, "node_modules/@hona/openeval/package.json"),
  ).json()) as { version: string }).version;

const readText = (path: string) =>
  Bun.file(path)
    .text()
    .catch(() => "");

const fixtureFor = (
  evalId: string,
  model: string,
  repetition: number,
): FixtureSlot => {
  const slot = fixtures[evalId]?.[model]?.[repetition - 1];
  if (!slot)
    throw new Error(
      `No fixture for ${evalId} / ${model} / repetition ${repetition}. ` +
        `Fixture mode only covers the models declared in fixtures/candidates.ts.`,
    );
  return slot;
};

/**
 * Fixture run path.
 *
 * Uses the SDK for everything that does not need a model or a container:
 * loadBenchmark (validation, rubric parsing, judge.ts bundling), recordEvidence
 * (content-addressed evidence archive), judgeEvidence (isolated code-judge
 * execution), criterionMean (equal-weight aggregation) and
 * verifyJudgmentEvidence (citation integrity). Rubric criteria from judge.md
 * are filled from fixtures/candidates.ts because the LLM judge requires
 * OpenCode; those scores are flagged in the report.
 */
export async function runFixtureSuite(
  onProgress: (event: ProgressEvent) => void = () => {},
): Promise<RunReport> {
  const startedAt = Date.now();
  onProgress({ type: "status", message: `Loading benchmark from ${BENCHMARK_DIR}` });
  const definition = await loadBenchmark(BENCHMARK_DIR);

  const evals: EvalInfo[] = await Promise.all(
    definition.evals.map(async (item) => ({
      id: item.id,
      name: item.name,
      prompt: item.prompt,
      rubric: item.judge || null,
      judgeSource: item.code
        ? await readText(resolve(item.directory, "judge.ts"))
        : null,
      criteria: item.criteria.map((criterion) => ({
        ...criterion,
        source: "judge.md" as const,
      })),
    })),
  );
  onProgress({
    type: "status",
    message: `Loaded ${evals.length} evals for ${definition.models.length} models × ${definition.repetitions} repetitions`,
  });

  const runId = new Date(startedAt).toISOString().replaceAll(/[:.]/g, "-");
  const runDir = resolve(RESULTS_DIR, "fixture", runId);
  await mkdir(runDir, { recursive: true });

  const total =
    definition.evals.length * definition.models.length * definition.repetitions;
  const slots: SlotResult[] = [];

  for (const item of definition.evals)
    for (const model of definition.models)
      for (let repetition = 1; repetition <= definition.repetitions; repetition++) {
        const slotStart = Date.now();
        const slotId = `${item.id}--${model.replace("/", "_")}--r${repetition}`;
        const slotDir = resolve(runDir, "slots", slotId);
        const fixture = fixtureFor(item.id, model, repetition);
        onProgress({ type: "status", message: `Recording evidence for ${slotId}` });

        const evidence = await recordEvidence({
          directory: resolve(slotDir, "evidence"),
          prompt: item.prompt,
          response: fixture.response,
          tools: fixture.tools ?? [],
        });

        let scores: Record<string, CriterionScore> = {};
        let code: SlotResult["code"];
        let error: string | undefined;
        let metrics: SlotResult["metrics"] = {
          tools: {
            calls: fixture.tools?.length ?? 0,
            succeeded: fixture.tools?.filter((t) => t.status === "succeeded").length ?? 0,
            failed: fixture.tools?.filter((t) => t.status === "failed").length ?? 0,
            errorRate: null,
          },
        };

        if (item.code) {
          onProgress({ type: "status", message: `Executing judge.ts for ${slotId}` });
          const graded = await judgeEvidence({
            evidence,
            code: resolve(item.directory, "judge.ts"),
            directory: resolve(slotDir, "judge"),
          });
          if (graded.code) {
            code = {
              state: graded.code.state,
              elapsedMs: graded.code.elapsedMs,
              output: graded.code.output,
              stdout: await readText(graded.code.stdout),
              stderr: await readText(graded.code.stderr),
              error: graded.code.error,
              sourceHash: graded.code.sourceHash,
            };
            if (graded.code.metrics)
              metrics = { tools: graded.code.metrics.tools };
          }
          if (graded.state !== "completed" || !graded.judgment) {
            error = graded.error ?? `judge.ts ${graded.state}`;
          } else {
            scores = { ...graded.judgment.scores };
          }
        }

        // Rubric criteria: a live run asks the judge model; fixture mode uses authored judgments.
        const fixtureCriteria: string[] = [];
        for (const criterion of item.criteria) {
          const authored = fixture.rubric?.[criterion.id];
          fixtureCriteria.push(criterion.id);
          scores[criterion.id] = authored
            ? {
                value: authored.value,
                reason: authored.reason,
                evidence: authored.quote
                  ? [{ kind: "response", quote: authored.quote }]
                  : [{ kind: "recording" }],
                source: "judge.md",
              }
            : {
                value: null,
                reason:
                  "No fixture judgment authored. A live run would ask the judge model declared in benchmark.ts.",
                evidence: [{ kind: "recording" }],
                source: "judge.md",
              };
        }

        const judgment: Judgment = {
          value: error ? null : criterionMean(scores),
          reason: error
            ? `Code judge failed: ${error}`
            : item.code && item.criteria.length
              ? "Equal-weight mean of judge.ts scores and judge.md criteria."
              : item.code
                ? "Criterion scores computed by judge.ts."
                : "Criterion scores from judge.md.",
          scores,
        };

        let citations: SlotResult["citations"] = { verified: true };
        try {
          await verifyJudgmentEvidence(judgment, evidence);
        } catch (cause) {
          citations = {
            verified: false,
            error: cause instanceof Error ? cause.message : String(cause),
          };
        }

        const slot: SlotResult = {
          id: slotId,
          evalId: item.id,
          model,
          repetition,
          state: error ? "failed" : "completed",
          ...(error ? { error } : {}),
          elapsedMs: Date.now() - slotStart,
          prompt: item.prompt,
          response: fixture.response,
          tools: fixture.tools ?? [],
          evidence: { directory: evidence.directory, hash: evidence.hash },
          judgment,
          fixtureCriteria,
          citations,
          ...(code ? { code } : {}),
          metrics,
        };
        slots.push(slot);
        onProgress({ type: "slot", slot, done: slots.length, total });
      }

  // judge.md declares its criteria up front; judge.ts criteria are discovered from results.
  for (const evalInfo of evals) {
    const declared = new Set(evalInfo.criteria.map((criterion) => criterion.id));
    for (const slot of slots)
      if (slot.evalId === evalInfo.id)
        for (const [id, score] of Object.entries(slot.judgment.scores))
          if (score.source === "judge.ts" && !declared.has(id)) {
            declared.add(id);
            evalInfo.criteria.push({
              id,
              name: id.replaceAll("_", " "),
              source: "judge.ts",
            });
          }
  }

  const completedAt = Date.now();
  const report: RunReport = {
    id: runId,
    mode: "fixture",
    createdAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    elapsedMs: completedAt - startedAt,
    sdkVersion: await sdkVersion(),
    benchmark: {
      name: definition.name,
      directory: definition.directory,
      models: definition.models,
      repetitions: definition.repetitions,
      judgeModel: definition.judge.model ?? null,
      evals,
    },
    slots,
    summary: summarize(slots, definition.models, evals),
  };
  await Bun.write(resolve(runDir, "report.json"), JSON.stringify(report, null, 2));
  await Bun.write(LATEST_REPORT, JSON.stringify(report, null, 2));
  onProgress({ type: "report", report });
  return report;
}

export async function readLatestReport(): Promise<RunReport | null> {
  const file = Bun.file(LATEST_REPORT);
  return (await file.exists()) ? ((await file.json()) as RunReport) : null;
}

export async function clearResults() {
  await rm(RESULTS_DIR, { recursive: true, force: true });
}
