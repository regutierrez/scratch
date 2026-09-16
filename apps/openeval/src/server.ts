import { resolve } from "node:path";
import { readLatestReport, runFixtureSuite, APP_ROOT } from "./run";
import type { ProgressEvent } from "./report";

const PUBLIC_DIR = resolve(APP_ROOT, "public");
const port = Number(process.env.PORT ?? 4174);

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const staticFile = (name: string) => {
  const file = Bun.file(resolve(PUBLIC_DIR, name));
  return async () =>
    (await file.exists())
      ? new Response(file)
      : new Response("Not found", { status: 404 });
};

let running: Promise<unknown> | null = null;

/** One run at a time; progress is streamed as server-sent events. */
const runStream = () => {
  if (running) return json({ error: "A run is already in progress" }, 409);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ProgressEvent) =>
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
        );
      running = runFixtureSuite(send)
        .catch((error: unknown) =>
          send({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
        )
        .finally(() => {
          running = null;
          controller.close();
        });
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
};

const server = Bun.serve({
  port,
  routes: {
    "/": staticFile("index.html"),
    "/app.js": staticFile("app.js"),
    "/styles.css": staticFile("styles.css"),
    "/api/report": async () => {
      const report = await readLatestReport();
      return report ? json(report) : json({ error: "No run yet" }, 404);
    },
    "/api/run": runStream,
  },
  fetch: () => new Response("Not found", { status: 404 }),
});

console.log(`OpenEval evidence viewer  →  ${server.url}`);
console.log(`Fixture mode: click "Run fixture suite" or run \`bun run eval\` first.`);
