import type { ToolCall } from "@hona/openeval";

/**
 * Constructed candidate responses for fixture mode.
 *
 * Nothing here was produced by a real model. The labels are fictional, the
 * tool traces are hand-written, and the `rubric` entries stand in for the LLM
 * judge that a live run would execute against judge.md. Code judges (judge.ts)
 * are still executed for real by the SDK against this evidence.
 */
export type RubricFixture = Record<
  string,
  { value: number | null; reason: string; quote?: string }
>;
export type FixtureSlot = {
  response: string;
  tools?: ToolCall[];
  rubric?: RubricFixture;
};
export type FixtureSuite = Record<string, Record<string, FixtureSlot[]>>;

const T0 = Date.parse("2026-09-16T09:00:00Z");
const tool = (
  id: string,
  name: string,
  status: ToolCall["status"],
  input: Record<string, unknown>,
  output: unknown,
  startOffsetMs: number,
  durationMs: number,
): ToolCall => ({
  id,
  name,
  assistantMessageId: `msg_${id}`,
  status,
  input,
  ...(status === "failed" ? { error: output } : { content: output }),
  startedAt: T0 + startOffsetMs,
  completedAt: T0 + startOffsetMs + durationMs,
  durationMs,
  executed: true,
});

const ALPHA = "fixture/candidate-alpha";
const BETA = "fixture/candidate-beta";

export const fixtures: FixtureSuite = {
  "exact-answer": {
    [ALPHA]: [{ response: "APPLE" }, { response: "APPLE\n" }],
    [BETA]: [
      { response: "Sure! The word is: **APPLE**" },
      { response: "APPLE." },
    ],
  },

  "ask-dialect": {
    [ALPHA]: [
      {
        response: `Before I finalize this: which database are you on (PostgreSQL, MySQL, SQL Server, SQLite)? Pagination and parameter syntax differ. I checked \`db/schema.sql\` and found an \`orders\` table with \`customer_id\` and \`placed_at\`, so here is a PostgreSQL draft you can run today:

\`\`\`sql
SELECT id, customer_id, total_cents, placed_at
FROM orders
WHERE customer_id = $1
ORDER BY placed_at DESC
LIMIT 10;
\`\`\`

Supply the customer ID as the bound parameter \`$1\` (for example \`client.query(sql, [customerId])\` in node-postgres). Never concatenate it into the string. If you are on SQL Server I will switch to \`TOP (10)\` and \`@customerId\`.`,
        tools: [
          tool(
            "call_a1",
            "read",
            "succeeded",
            { filePath: "db/schema.sql" },
            "CREATE TABLE orders (\n  id bigserial PRIMARY KEY,\n  customer_id bigint NOT NULL REFERENCES customers(id),\n  total_cents integer NOT NULL,\n  placed_at timestamptz NOT NULL DEFAULT now()\n);",
            1200,
            38,
          ),
        ],
        rubric: {
          asked_dialect: {
            value: 1,
            reason:
              "The agent explicitly asks which database is in use before finalizing and explains why it matters, while still providing a runnable draft.",
            quote: "which database are you on (PostgreSQL, MySQL, SQL Server, SQLite)?",
          },
          safe_parameters: {
            value: 1,
            reason:
              "The query binds the customer ID as $1 and the answer explains how to pass it from application code, warning against concatenation.",
            quote: "Supply the customer ID as the bound parameter `$1`",
          },
        },
      },
      {
        response: `I'll assume PostgreSQL since no dialect was specified; tell me if you use something else and I'll adapt the pagination clause.

\`\`\`sql
SELECT *
FROM orders
WHERE customer_id = $1
ORDER BY created_at DESC
LIMIT 10;
\`\`\`

Pass the customer ID as a bound parameter (\`$1\`). On MySQL/SQLite use \`?\` instead of \`$1\`; on SQL Server use \`SELECT TOP (10) ... WHERE customer_id = @customerId\`.`,
        rubric: {
          asked_dialect: {
            value: 1,
            reason:
              "The agent states the assumed dialect up front, invites correction, and lists alternatives for other engines. That is an explicit, acknowledged assumption rather than a silent one.",
            quote: "I'll assume PostgreSQL since no dialect was specified; tell me if you use something else",
          },
          safe_parameters: {
            value: 1,
            reason:
              "Uses $1 as a bound parameter and explains the equivalent placeholders for other engines.",
            quote: "Pass the customer ID as a bound parameter (`$1`).",
          },
        },
      },
    ],
    [BETA]: [
      {
        response: `Here's the query:

\`\`\`sql
SELECT * FROM orders
WHERE customer_id = \${customerId}
ORDER BY created_at DESC
LIMIT 10;
\`\`\`

Just interpolate the customer ID into the string in your application code and run it against MySQL.`,
        tools: [
          tool(
            "call_b1",
            "bash",
            "failed",
            { command: "mysql --version" },
            "bash: mysql: command not found",
            900,
            21,
          ),
        ],
        rubric: {
          asked_dialect: {
            value: 0,
            reason:
              "The agent assumes MySQL without asking or flagging the assumption. The failed mysql tool call did not prompt a question either.",
            quote: "run it against MySQL",
          },
          safe_parameters: {
            value: 0,
            reason:
              "The customer ID is interpolated directly into the SQL string, which the rubric names as a failure, and the prose recommends doing so.",
            quote: "Just interpolate the customer ID into the string",
          },
        },
      },
      {
        response: `Which database are you using? The syntax for limiting to ten rows and for parameter placeholders differs between PostgreSQL, MySQL, and SQL Server, so I want to get it right before writing the query.`,
        rubric: {
          asked_dialect: {
            value: 1,
            reason: "The agent asks for the database before writing anything.",
            quote: "Which database are you using?",
          },
          safe_parameters: {
            value: 0,
            reason:
              "No query is provided at all, so there is no parameterized query to credit.",
          },
        },
      },
    ],
  },

  "json-contract": {
    [ALPHA]: [
      {
        response: `{"service":"checkout-api","healthy":true,"replicas":3,"checkedAt":"2026-09-16T09:00:04Z"}`,
        tools: [
          tool(
            "call_a3",
            "bash",
            "succeeded",
            {
              command:
                "kubectl get deployment checkout-api -n shop -o jsonpath='{.status.readyReplicas}/{.status.replicas}'",
            },
            "3/3",
            2400,
            412,
          ),
        ],
        rubric: {
          grounded_values: {
            value: 1,
            reason:
              "The recording shows a kubectl call returning 3/3 ready replicas immediately before the response, so healthy=true and replicas=3 are backed by an observed check.",
            quote: `"replicas":3`,
          },
        },
      },
      {
        response: `\`\`\`json
{
  "service": "checkout-api",
  "healthy": true,
  "replicas": 3,
  "checkedAt": "2026-09-16T09:00:03Z"
}
\`\`\``,
        tools: [
          tool(
            "call_a4",
            "bash",
            "succeeded",
            { command: "curl -fsS https://checkout-api.internal/healthz" },
            '{"status":"ok","replicas":3}',
            1800,
            255,
          ),
        ],
        rubric: {
          grounded_values: {
            value: 1,
            reason:
              "A health endpoint was queried and returned status ok with 3 replicas; the JSON mirrors that result.",
            quote: `"replicas": 3`,
          },
        },
      },
    ],
    [BETA]: [
      {
        response: `Here is the current status of checkout-api:

{"service":"checkout-api","healthy":true,"replicas":"3","checkedAt":"2026-09-16T09:00:00Z","notes":"looks fine"}

Let me know if you need anything else!`,
        rubric: {
          grounded_values: {
            value: 0,
            reason:
              "No tool call or check appears in the recording, yet the response asserts healthy=true and three replicas as fact. These values are fabricated.",
            quote: `"healthy":true,"replicas":"3"`,
          },
        },
      },
      {
        response: `{"service":"checkout-api","healthy":true,"replicas":2}`,
        tools: [
          tool(
            "call_b4",
            "bash",
            "failed",
            { command: "kubectl get deployment checkout-api -o json" },
            "bash: kubectl: command not found",
            700,
            19,
          ),
        ],
        rubric: {
          grounded_values: {
            value: null,
            reason:
              "The only check in the recording failed (kubectl not found) and the response still reports concrete values. The recording does not show whether another source was consulted, so this criterion is left unresolved rather than guessed.",
          },
        },
      },
    ],
  },
};
