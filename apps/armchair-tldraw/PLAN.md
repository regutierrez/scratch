# Armchair tldraw plan

## Goal

Build a self-contained Bun app with a tldraw canvas and an OpenAI Realtime (`gpt-live`) voice loop that turns speech and sketch context into live HTML/CSS edits in a preview pane. Success is `bun install && bun run dev` from this folder.

## In scope

- A tldraw canvas for sketching and selecting visual context.
- Realtime voice editing when `OPENAI_API_KEY` is set; the key remains server-side and is never committed.
- A typed-prompt fallback that visibly edits the preview without an API key.
- A tiny starter page with a headline, paragraph, and button.
- A README with setup and usage instructions.

## Out of scope

- A native iPad app.
- Multi-user collaboration or authentication.
- An additional GitHub repository.
- An additional Cloudflare Pages project.

## Stack

Bun, React, TypeScript, Vite, tldraw, and a Bun WebSocket relay for the OpenAI Realtime API.

## Validation artifacts

Run type checking and a production build, then capture at least one screenshot and one video showing the typed-prompt path editing the live preview.
