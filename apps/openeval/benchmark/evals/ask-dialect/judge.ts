import type { JudgeContext } from "@hona/openeval";

// Code criteria complement the judge.md rubric. IDs must not overlap with it.
const sqlBlocks = (text: string) =>
  [...text.matchAll(/```(?:sql)?\s*([\s\S]*?)```/gi)].map((m) => m[1] ?? "");

export default ({ response, recording, metrics }: JudgeContext) => {
  const blocks = sqlBlocks(response.text);
  const sql = blocks.length ? blocks.join("\n") : response.text;
  const limitsToTen =
    /\bLIMIT\s+10\b/i.test(sql) ||
    /\bTOP\s*\(?\s*10\s*\)?/i.test(sql) ||
    /\bFETCH\s+FIRST\s+10\s+ROWS\s+ONLY\b/i.test(sql);
  const ordersByRecency = /ORDER\s+BY\s+[\w."]*\w+\s+DESC/i.test(sql);
  const interpolates =
    /\$\{[^}]*\}/.test(sql) ||
    /['"]\s*\+\s*\w+|\w+\s*\+\s*['"]/.test(sql) ||
    /\bf["'][^"']*\{/.test(response.text);
  const tools = recording.tools();
  return {
    scores: {
      limits_to_ten: limitsToTen,
      orders_by_recency: ordersByRecency,
      no_string_interpolation: !interpolates,
      // Fractional credit: 1 when every tool call finished cleanly, else the success ratio.
      tool_reliability:
        metrics.tools.calls === 0
          ? 1
          : metrics.tools.succeeded / metrics.tools.calls,
    },
    detail: {
      sqlBlocks: blocks.length,
      toolCalls: tools.map((tool) => ({ name: tool.name, status: tool.status })),
      graded: sql.trim().slice(0, 400),
    },
  };
};
