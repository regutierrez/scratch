const port = Number(process.env.REALTIME_PORT ?? 8787)
const model = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime'

type RelayData = {
  upstream?: WebSocket
  queue: string[]
}

const server = Bun.serve<RelayData>({
  port,
  fetch(request, server) {
    const url = new URL(request.url)

    if (url.pathname === '/api/status') {
      return Response.json({
        realtimeAvailable: Boolean(process.env.OPENAI_API_KEY),
        model,
      })
    }

    if (url.pathname === '/realtime') {
      if (!process.env.OPENAI_API_KEY) {
        return new Response('OPENAI_API_KEY is not configured', { status: 503 })
      }

      if (server.upgrade(request, { data: { queue: [] } })) return
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    return new Response('Not found', { status: 404 })
  },
  websocket: {
    open(client) {
      const upstream = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1',
          },
        },
      )

      client.data.upstream = upstream

      upstream.addEventListener('open', () => {
        client.send(JSON.stringify({ type: 'relay.ready', model }))
        for (const message of client.data.queue) upstream.send(message)
        client.data.queue = []
      })

      upstream.addEventListener('message', (event) => {
        if (client.readyState === WebSocket.OPEN) client.send(String(event.data))
      })

      upstream.addEventListener('error', () => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: 'relay.error',
              message: 'Could not connect to OpenAI Realtime.',
            }),
          )
        }
      })

      upstream.addEventListener('close', (event) => {
        if (client.readyState === WebSocket.OPEN) client.close(event.code, event.reason)
      })
    },
    message(client, message) {
      const serialized =
        typeof message === 'string' ? message : new TextDecoder().decode(message)
      const upstream = client.data.upstream

      if (upstream?.readyState === WebSocket.OPEN) upstream.send(serialized)
      else client.data.queue.push(serialized)
    },
    close(client) {
      client.data.upstream?.close()
    },
  },
})

console.log(`Realtime relay listening on http://localhost:${server.port}`)
