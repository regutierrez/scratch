import type {
  CriterionScore,
  EvidenceRef,
  Judgment,
  ToolCall,
} from "@hona/openeval";

export type CriterionInfo = {
  id: string;
  name: string;
  source: "judge.md" | "judge.ts";
};

export type EvalInfo = {
  id: string;
  name: string;
  prompt: string;
  rubric: string | null;
  judgeSource: string | null;
  criteria: CriterionInfo[];
};

export type SlotState = "completed" | "failed";

export type SlotResult = {
  id: string;
  evalId: string;
  model: string;
  repetition: number;
  state: SlotState;
  error?: string;
  elapsedMs: number;
  prompt: string;
  response: string;
  tools: ToolCall[];
  evidence: EvidenceRef;
  judgment: Judgment;
  /** Which criteria came from fixture rubric judgments instead of a judge model. */
  fixtureCriteria: string[];
  citations: { verified: boolean; error?: string };
  code?: {
    state: "completed" | "failed" | "timed_out";
    elapsedMs: number;
    output?: unknown;
    stdout: string;
    stderr: string;
    error?: string;
    sourceHash: string;
  };
  metrics: {
    tools: { calls: number; succeeded: number; failed: number; errorRate: number | null };
  };
};

export type ModelSummary = {
  model: string;
  slots: number;
  scored: number;
  passed: number;
  unresolved: number;
  mean: number | null;
};

export type CellSummary = {
  evalId: string;
  model: string;
  mean: number | null;
  slots: number;
  unresolved: number;
};

export type RunReport = {
  id: string;
  mode: "fixture";
  createdAt: string;
  completedAt: string;
  elapsedMs: number;
  sdkVersion: string;
  benchmark: {
    name: string;
    directory: string;
    models: string[];
    repetitions: number;
    judgeModel: string | null;
    evals: EvalInfo[];
  };
  slots: SlotResult[];
  summary: {
    slots: number;
    criteria: number;
    passed: number;
    failed: number;
    unresolved: number;
    mean: number | null;
    models: ModelSummary[];
    cells: CellSummary[];
  };
};

export type ProgressEvent =
  | { type: "status"; message: string }
  | { type: "slot"; slot: SlotResult; done: number; total: number }
  | { type: "report"; report: RunReport }
  | { type: "error"; message: string };

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export const isPass = (judgment: Judgment) => judgment.value === 1;

export function summarize(
  slots: SlotResult[],
  models: string[],
  evals: EvalInfo[],
): RunReport["summary"] {
  const scored = slots.filter((slot) => slot.judgment.value !== null);
  const cells: CellSummary[] = [];
  for (const evalInfo of evals)
    for (const model of models) {
      const subset = slots.filter(
        (slot) => slot.evalId === evalInfo.id && slot.model === model,
      );
      const values = subset
        .map((slot) => slot.judgment.value)
        .filter((value): value is number => value !== null);
      cells.push({
        evalId: evalInfo.id,
        model,
        mean: values.length === subset.length ? mean(values) : null,
        slots: subset.length,
        unresolved: subset.length - values.length,
      });
    }
  const modelSummaries: ModelSummary[] = models.map((model) => {
    const subset = slots.filter((slot) => slot.model === model);
    // Equal eval weights: average the per-eval means, then across evals.
    const perEval = evals.map(
      (evalInfo) =>
        cells.find((cell) => cell.evalId === evalInfo.id && cell.model === model)
          ?.mean ?? null,
    );
    return {
      model,
      slots: subset.length,
      scored: subset.filter((slot) => slot.judgment.value !== null).length,
      passed: subset.filter((slot) => isPass(slot.judgment)).length,
      unresolved: subset.filter((slot) => slot.judgment.value === null).length,
      mean: perEval.every((value) => value !== null)
        ? mean(perEval as number[])
        : null,
    };
  });
  return {
    slots: slots.length,
    criteria: evals.reduce((sum, evalInfo) => sum + evalInfo.criteria.length, 0),
    passed: slots.filter((slot) => isPass(slot.judgment)).length,
    failed: scored.filter((slot) => !isPass(slot.judgment)).length,
    unresolved: slots.length - scored.length,
    mean: mean(scored.map((slot) => slot.judgment.value as number)),
    models: modelSummaries,
    cells,
  };
}

export const scoreEntries = (judgment: Judgment) =>
  Object.entries(judgment.scores) as [string, CriterionScore][];
