import type { JudgeContext } from "@hona/openeval";

// Deterministic, code-only eval: no judge model is involved.
export default ({ response }: JudgeContext) => {
  const text = response.text;
  const trimmed = text.trim();
  return {
    scores: {
      correct_answer: trimmed === "APPLE",
      no_extra_output: trimmed.split(/\s+/).length === 1,
      no_formatting: !/[`*_#>]/.test(trimmed),
    },
    detail: {
      length: text.length,
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      trailingWhitespace: text !== trimmed,
    },
  };
};
