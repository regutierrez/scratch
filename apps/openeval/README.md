# OpenEval demo

A self-contained Bun app that shows what [`@hona/openeval`](https://github.com/Hona/openeval) is for: typed prompt + judge evals whose scores you can trace back to evidence.

- **`benchmark/`** is a real OpenEval benchmark: `benchmark.ts` plus three evals, each a folder with `prompt.md`, an optional `judge.md` rubric with named criteria, and a `judge.ts` code judge (a plain function returning scores).
- **`src/run.ts`** is a run path built on the SDK's own primitives. In fixture mode it records constructed candidate responses as evidence, executes every `judge.ts` for real in an isolated Bun process, merges rubric criteria, and writes a structured `report.json`.
- **`public/`** is an evidence viewer served by `Bun.serve`: a score matrix, per-run drilldown with criterion scores, reasons, citations, response text, tool-call trace, code-judge output, and evidence hashes.

Source bookmark: https://x.com/LukeParkerDev/status/2098354727880921121 · Docs: https://openev.al

## Run it (fixture mode, no Docker / OpenCode / keys)

```sh
cd apps/openeval
bun install
bun run dev        # http://localhost:4174 — click "Run fixture suite"
```

Or from the terminal:

```sh
bun run eval       # runs the suite and prints a score table + per-criterion breakdown
bun run typecheck
```

Results land in `results/latest.json` and `results/fixture/<run-id>/`, which holds one folder per run with the SDK's evidence archive (`manifest.json`, `events.jsonl`) and the judge execution (`input.json`, `result.json`, bundled `judge.js`, stdout/stderr).

`PORT=5000 bun run dev` changes the port.

### What runs for real, and what is a fixture

| Step | Fixture mode | Live mode |
| --- | --- | --- |
| Validate benchmark, parse `## Criterion:` headings, bundle `judge.ts` | `loadBenchmark` (SDK) | same |
| Candidate execution | constructed responses + tool traces from `fixtures/candidates.ts` | OpenCode agent in a Docker container |
| Evidence archive (content-addressed, sha256) | `recordEvidence` (SDK) | recorded by the runner |
| Code judge (`judge.ts`) | `judgeEvidence` (SDK), isolated Bun process | same |
| Rubric judge (`judge.md`) | authored judgments in `fixtures/candidates.ts`, flagged `fixture` in the UI | judge model via OpenCode |
| Aggregation | `criterionMean` (SDK), equal weights, `null` if any criterion is unresolved | same |
| Citation integrity | `verifyJudgmentEvidence` (SDK) | same |

The fixture labels `fixture/candidate-alpha` and `fixture/candidate-beta` are fictional. Nothing in `fixtures/` was produced by a model.

## The evals

| Eval | Judge | Criteria |
| --- | --- | --- |
| `exact-answer` | `judge.ts` only | `correct_answer`, `no_extra_output`, `no_formatting` |
| `ask-dialect` | `judge.md` + `judge.ts` | rubric: `asked_dialect`, `safe_parameters` · code: `limits_to_ten`, `orders_by_recency`, `no_string_interpolation`, `tool_reliability` (fractional) |
| `json-contract` | `judge.md` + `judge.ts` | rubric: `grounded_values` · code: `valid_json`, `required_keys` (fractional), `correct_types`, `json_only`, `no_extra_keys` |

Booleans normalize to 0/1, numbers may be any finite value in 0..1, and `null` means unresolved. One fixture (`json-contract`, beta, repetition 2) deliberately leaves `grounded_values` unresolved so the viewer shows how a `null` criterion propagates to the run and the model total.

## Live mode (Docker + OpenCode)

Requires Bun 1.4.2+, Docker, and models connected in [OpenCode](https://opencode.ai). Replace the fixture labels with your connected models, either via environment variables or by editing `benchmark/benchmark.ts`:

```sh
export OPENEVAL_MODELS="anthropic/claude-sonnet-4-5,openai/gpt-5"
export OPENEVAL_JUDGE_MODEL="anthropic/claude-sonnet-4-5"

bun run live:image   # builds openeval-runtime:2.0.3 (once per OpenCode upgrade)
bun run live:plan    # shows the work without executing it
bun run live:run     # runs candidates in containers, judges, resumes on re-run
bun run live:view    # upstream results viewer at http://127.0.0.1:4173
```

These wrap `bunx --bun @hona/openeval <command> --benchmark benchmark`. Live results are written to `benchmark/results/` and are ignored by git. Scope flags such as `--only-eval ask-dialect --only-repetition 1` pass through, for example `bun run live:run -- --only-eval ask-dialect`.

## Layout

```
apps/openeval/
├── benchmark/
│   ├── benchmark.ts             models, judge, repetitions (Benchmark type)
│   └── evals/
│       ├── exact-answer/        prompt.md · judge.ts
│       ├── ask-dialect/         prompt.md · judge.md · judge.ts
│       └── json-contract/       prompt.md · judge.md · judge.ts
├── fixtures/candidates.ts       constructed responses, tool traces, rubric judgments
├── src/
│   ├── run.ts                   fixture run path on SDK primitives
│   ├── report.ts                RunReport types + summary
│   ├── cli.ts                   `bun run eval`
│   └── server.ts                Bun.serve: static viewer + /api/report + /api/run (SSE)
└── public/                      index.html · app.js · styles.css (no build step)
```
