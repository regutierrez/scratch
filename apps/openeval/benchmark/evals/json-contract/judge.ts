import type { JudgeContext } from "@hona/openeval";

const REQUIRED = ["service", "healthy", "replicas", "checkedAt"] as const;

const extractJson = (text: string) => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf("{"),
    end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
};

export default ({ response }: JudgeContext) => {
  const text = response.text.trim();
  const candidate = extractJson(text);
  let parsed: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(candidate);
    if (value && typeof value === "object" && !Array.isArray(value))
      parsed = value as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const keys = parsed ? Object.keys(parsed) : [];
  const present = REQUIRED.filter((key) => keys.includes(key));
  const typesOk =
    !!parsed &&
    typeof parsed.service === "string" &&
    typeof parsed.healthy === "boolean" &&
    Number.isInteger(parsed.replicas) &&
    typeof parsed.checkedAt === "string" &&
    !Number.isNaN(Date.parse(parsed.checkedAt));
  // JSON only: the whole response must be the object itself or a single fenced block.
  const jsonOnly =
    !!parsed &&
    (text === candidate || /^```(?:json)?\s*[\s\S]*```$/i.test(text));
  return {
    scores: {
      valid_json: parsed !== null,
      // Fractional credit for partially complete objects.
      required_keys: parsed ? present.length / REQUIRED.length : 0,
      correct_types: typesOk,
      json_only: jsonOnly,
      no_extra_keys: parsed ? keys.every((key) => (REQUIRED as readonly string[]).includes(key)) : false,
    },
    detail: { keys, missing: REQUIRED.filter((key) => !keys.includes(key)) },
  };
};
