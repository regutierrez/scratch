# Armchair tldraw

A live webpage workbench: sketch layout ideas in tldraw, then use a typed direction or OpenAI Realtime voice input to edit the preview.

## Run

```bash
bun install
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

The typed prompt path works without configuration. Try:

- `Make it dark and electric`
- `Try an ocean palette`
- `Center it and make the button round`
- `Change the headline to Ideas deserve room to grow`

## Enable Realtime voice

Copy `.env.example` to `.env`, add a server-side OpenAI API key, and restart the dev command:

```bash
cp .env.example .env
```

The browser connects to the local Bun relay at `/realtime`; `OPENAI_API_KEY` is read only by `server.ts` and is never sent to browser code. You can override the default Realtime model with `OPENAI_REALTIME_MODEL`.

Sketch before speaking to include the current canvas shapes in the model's page-editing context. Select shapes to send only that selection.

## Checks

```bash
bun run check
bun run build
```
