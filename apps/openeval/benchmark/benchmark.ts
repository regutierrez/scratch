import type { Benchmark, ModelRef } from "@hona/openeval";

// Fixture mode grades constructed responses attributed to these fictional labels.
// For a live run, set OPENEVAL_MODELS / OPENEVAL_JUDGE_MODEL to models connected
// in OpenCode (for example "anthropic/claude-sonnet-4-5"), or edit the defaults.
const fromEnv = (name: string) =>
  process.env[name]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) as ModelRef[] | undefined;

export default {
  name: "openeval-demo",
  models: fromEnv("OPENEVAL_MODELS") ?? [
    "fixture/candidate-alpha",
    "fixture/candidate-beta",
  ],
  judge: {
    model: fromEnv("OPENEVAL_JUDGE_MODEL")?.[0] ?? "fixture/rubric-judge",
    timeoutMs: 300_000,
    websearch: false,
  },
  repetitions: 2,
  concurrency: 2,
  candidate: { timeoutMs: 600_000, websearch: false },
} satisfies Benchmark;
