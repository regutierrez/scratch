# openeval

Single-user MVP of OpenEval (`@hona/openeval`): Bun-native typed prompt/judge evals with an evidence viewer.

Source bookmark: https://x.com/LukeParkerDev/status/2098354727880921121
Docs: https://openev.al · https://github.com/Hona/openeval

## Goal

A self-contained Bun app under `apps/openeval/` that defines a small typed prompt + judge suite, runs it, and shows results in a simple evidence UI. Success: `bun install && bun run dev` from this folder starts the viewer on http://localhost:4174, and one click runs the fixture suite end to end with no Docker, no OpenCode, and no model keys. The live path (Docker + OpenCode) is documented, not required.

## In scope

- A real `benchmark/` folder in the `@hona/openeval` layout: `benchmark.ts` plus three evals (`exact-answer`, `ask-dialect`, `json-contract`), each with `prompt.md` and a `judge.ts` code judge; two also carry a `judge.md` rubric with named criteria.
- A run path built on the SDK's own primitives, not a re-implementation:
  - `loadBenchmark` validates the folder, parses rubric criteria, and bundles each `judge.ts`.
  - `recordEvidence` writes a content-addressed evidence archive for each constructed candidate response (prompt, response text, tool calls).
  - `judgeEvidence` executes the bundled code judge in an isolated Bun process against that evidence and returns normalized criterion scores.
  - `criterionMean` combines code and rubric criteria with equal weight; `verifyJudgmentEvidence` checks every citation quote against the recording.
- Fixture mode: constructed candidate responses and tool traces for two fictional models, plus pre-authored rubric judgments standing in for the LLM judge. Produces a structured `report.json`.
- Evidence viewer served by `Bun.serve`: score matrix (eval × model), per-slot drilldown with criterion scores, reasons, evidence citations, response text, tool-call trace, code-judge raw output and stdout, evidence hash, and the rubric/judge source.
- README with fixture instructions and the live Docker + OpenCode path.

## Out of scope

- New GitHub repo or extra Cloudflare Pages project.
- Running real candidates or a real LLM judge in this PR (needs Docker + connected OpenCode models).
- Large eval corpus, repetitions at scale, CI harness, or a rebuild of the upstream viewer.

## Stack

- Bun 1.4.2+ (runtime, `Bun.serve`, `Bun.build` via the SDK)
- `@hona/openeval` 0.3.2 (types, `loadBenchmark`, `recordEvidence`, `judgeEvidence`, `criterionMean`, `verifyJudgmentEvidence`)
- Vanilla HTML/CSS/JS viewer, no build step; SSE for run progress

## Validation (required on the PR)

- `bun install && bun run typecheck && bun run eval` succeed from `apps/openeval/`
- At least one screenshot of the running viewer with results visible
- At least one video of a fixture run (click Run, watch progress, open a slot's evidence)
