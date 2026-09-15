import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tldraw, type Editor, type TLShape } from '@tldraw/tldraw'

type SiteState = {
  headline: string
  paragraph: string
  button: string
  background: string
  foreground: string
  accent: string
  radius: number
  align: 'left' | 'center'
}

const initialSite: SiteState = {
  headline: 'Make room for better ideas.',
  paragraph:
    'A tiny studio for ambitious teams. We turn rough sketches into memorable digital experiences.',
  button: 'Start a project',
  background: '#f2efe8',
  foreground: '#191a17',
  accent: '#ff5c35',
  radius: 18,
  align: 'left',
}

const palettes = {
  ocean: { background: '#e8f3f4', foreground: '#102c35', accent: '#087e8b' },
  sunset: { background: '#fff1e6', foreground: '#351c17', accent: '#ed553b' },
  mint: { background: '#e9f5e9', foreground: '#17321e', accent: '#2f855a' },
  purple: { background: '#f0eaff', foreground: '#241342', accent: '#7651d8' },
  dark: { background: '#181917', foreground: '#f4f1e8', accent: '#c8ff63' },
  pink: { background: '#fff0f5', foreground: '#351724', accent: '#ef4770' },
}

const suggestions = [
  'Make it dark and electric',
  'Try an ocean palette',
  'Center it and make the button round',
]

function shapeSummary(shapes: TLShape[]) {
  if (!shapes.length) return 'No marks on the canvas yet.'

  return shapes
    .slice(-12)
    .map((shape) => {
      const props = shape.props as Record<string, unknown>
      const text =
        typeof props.text === 'string'
          ? ` containing “${props.text.slice(0, 80)}”`
          : ''
      return `${shape.type}${text} at (${Math.round(shape.x)}, ${Math.round(shape.y)})`
    })
    .join('; ')
}

function deterministicEdit(prompt: string, current: SiteState): SiteState {
  const lower = prompt.toLowerCase()
  let next = { ...current }

  for (const [name, palette] of Object.entries(palettes)) {
    if (lower.includes(name)) next = { ...next, ...palette }
  }

  if (lower.includes('orange')) next.accent = '#ff6b35'
  if (lower.includes('blue')) next.accent = '#247ba0'
  if (lower.includes('green')) next.accent = '#2f855a'
  if (lower.includes('yellow')) next.accent = '#f0c808'
  if (lower.includes('center')) next.align = 'center'
  if (lower.includes('left align')) next.align = 'left'
  if (lower.includes('square') || lower.includes('sharp')) next.radius = 2
  if (lower.includes('round') || lower.includes('soft')) next.radius = 999

  const textPatterns: Array<[keyof SiteState, RegExp]> = [
    ['headline', /headline (?:to|say|that says)\s+["“]?([^"”.!]+[.!]?)/i],
    ['paragraph', /paragraph (?:to|say|that says)\s+["“]?([^"”]+)["”]?/i],
    ['button', /button (?:to|say|that says)\s+["“]?([^"”.!]+[.!]?)/i],
  ]

  for (const [key, pattern] of textPatterns) {
    const match = prompt.match(pattern)
    if (match) next = { ...next, [key]: match[1].trim() }
  }

  return next
}

function safeSitePatch(value: unknown): Partial<SiteState> {
  if (!value || typeof value !== 'object') return {}
  const input = value as Record<string, unknown>
  const patch: Partial<SiteState> = {}

  for (const key of ['headline', 'paragraph', 'button'] as const) {
    if (typeof input[key] === 'string') patch[key] = input[key].slice(0, 240)
  }
  for (const key of ['background', 'foreground', 'accent'] as const) {
    if (
      typeof input[key] === 'string' &&
      /^#[0-9a-f]{6}$/i.test(input[key] as string)
    ) {
      patch[key] = input[key] as string
    }
  }
  if (typeof input.radius === 'number') {
    patch.radius = Math.max(0, Math.min(999, input.radius))
  }
  if (input.align === 'left' || input.align === 'center') patch.align = input.align

  return patch
}

export function App() {
  const editorRef = useRef<Editor | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const [site, setSite] = useState(initialSite)
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('Ready for a direction')
  const [realtimeAvailable, setRealtimeAvailable] = useState(false)
  const [recording, setRecording] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    fetch('/api/status')
      .then((response) => response.json())
      .then((data: { realtimeAvailable?: boolean }) =>
        setRealtimeAvailable(Boolean(data.realtimeAvailable)),
      )
      .catch(() => setRealtimeAvailable(false))
  }, [])

  useEffect(
    () => () => {
      socketRef.current?.close()
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      void audioContextRef.current?.close()
    },
    [],
  )

  const getSketch = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return 'Canvas is still loading.'
    const selected = editor.getSelectedShapes()
    return shapeSummary(selected.length ? selected : editor.getCurrentPageShapes())
  }, [])

  const applyTypedPrompt = useCallback(
    (value = prompt) => {
      const trimmed = value.trim()
      if (!trimmed) return
      const sketch = getSketch()
      setSite((current) => deterministicEdit(trimmed, current))
      setRevision((current) => current + 1)
      setStatus(
        sketch.startsWith('No marks')
          ? 'Edit applied — add a sketch to give voice mode more context'
          : `Edit applied with ${editorRef.current?.getCurrentPageShapes().length ?? 0} canvas mark(s)`,
      )
      setPrompt('')
    },
    [getSketch, prompt],
  )

  const stopVoice = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    setRecording(false)
    setStatus('Voice edit sent — listening for the page update')
  }, [])

  const startVoice = useCallback(async () => {
    if (!realtimeAvailable) {
      setStatus('Add OPENAI_API_KEY to use voice — typed edits work now')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      const socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/realtime`,
      )
      const context = new AudioContext({ sampleRate: 24000 })
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)

      mediaStreamRef.current = stream
      audioContextRef.current = context
      socketRef.current = socket

      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>

        if (message.type === 'relay.ready') {
          socket.send(
            JSON.stringify({
              type: 'session.update',
              session: {
                type: 'realtime',
                output_modalities: ['text'],
                instructions: `You edit a tiny landing page. Canvas context: ${getSketch()}.
Return only one compact JSON object with any changed fields from:
headline, paragraph, button, background, foreground, accent, radius, align.
Colors must be six-digit hex. align is left or center. Never return markdown.`,
                audio: {
                  input: {
                    format: { type: 'audio/pcm', rate: 24000 },
                    turn_detection: {
                      type: 'server_vad',
                      silence_duration_ms: 700,
                      create_response: true,
                    },
                  },
                },
              },
            }),
          )
          setStatus('Listening — describe the page you want')
        }

        const candidate =
          message.type === 'response.output_text.done' ||
          message.type === 'response.text.done'
            ? message.text
            : message.type === 'response.content_part.done'
              ? (message.part as { text?: unknown } | undefined)?.text
              : undefined

        if (typeof candidate === 'string') {
          try {
            const parsed = JSON.parse(
              candidate.replace(/^```json\s*|\s*```$/g, ''),
            ) as unknown
            setSite((current) => ({ ...current, ...safeSitePatch(parsed) }))
            setRevision((current) => current + 1)
            setStatus('Voice edit applied')
          } catch {
            setStatus('Voice response was not an edit — try one clear direction')
          }
        }

        if (message.type === 'relay.error' || message.type === 'error') {
          setStatus('Realtime connection failed — typed editing is still available')
          stopVoice()
        }
      })

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) return
        const floats = event.inputBuffer.getChannelData(0)
        const pcm = new Int16Array(floats.length)
        for (let index = 0; index < floats.length; index += 1) {
          const sample = Math.max(-1, Math.min(1, floats[index]))
          pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }
        const bytes = new Uint8Array(pcm.buffer)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        socket.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: btoa(binary),
          }),
        )
      }

      source.connect(processor)
      processor.connect(context.destination)
      setRecording(true)
      setStatus('Connecting to OpenAI Realtime…')
    } catch {
      setStatus('Microphone access is needed for voice — use a typed edit instead')
    }
  }, [getSketch, realtimeAvailable, stopVoice])

  const code = useMemo(
    () => `<main class="hero">
  <p class="eyebrow">ARMCHAIR / STUDIO</p>
  <h1>${site.headline}</h1>
  <p>${site.paragraph}</p>
  <button>${site.button} →</button>
</main>

<style>
  .hero {
    color: ${site.foreground};
    background: ${site.background};
    text-align: ${site.align};
  }
  button {
    background: ${site.accent};
    border-radius: ${site.radius}px;
  }
</style>`,
    [site],
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Armchair home">
          <span className="brand-mark">A</span>
          <span>armchair</span>
        </a>
        <div className="topbar-meta">
          <span className="status-dot" />
          local canvas
          <span className="divider" />
          <span>revision {String(revision).padStart(2, '0')}</span>
        </div>
      </header>

      <section className="workspace">
        <section className="panel canvas-panel">
          <div className="panel-heading">
            <div>
              <span className="step">01</span>
              <h2>Sketch the intent</h2>
            </div>
            <p>Draw a layout, circle a detail, or leave a note.</p>
          </div>
          <div className="canvas-wrap">
            <Tldraw
              persistenceKey="armchair-tldraw-demo"
              onMount={(editor) => {
                editorRef.current = editor
              }}
            />
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <div>
              <span className="step">02</span>
              <h2>Shape the page</h2>
            </div>
            <button className="code-toggle" onClick={() => setShowCode(!showCode)}>
              {showCode ? 'Show preview' : 'View HTML'}
            </button>
          </div>

          <div className="browser">
            <div className="browser-bar">
              <div className="traffic-lights">
                <span />
                <span />
                <span />
              </div>
              <div className="address">armchair.local/preview</div>
              <span className="live-label">LIVE</span>
            </div>
            {showCode ? (
              <pre className="code-view">
                <code>{code}</code>
              </pre>
            ) : (
              <div
                className={`site-preview align-${site.align}`}
                style={
                  {
                    '--site-bg': site.background,
                    '--site-fg': site.foreground,
                    '--site-accent': site.accent,
                    '--site-radius': `${site.radius}px`,
                  } as React.CSSProperties
                }
              >
                <nav>
                  <strong>FIELDWORK</strong>
                  <span>Independent creative studio · Est. 2026</span>
                </nav>
                <div className="hero-content">
                  <p className="eyebrow">DESIGN / DIRECTION / DIGITAL</p>
                  <h1>{site.headline}</h1>
                  <p className="site-copy">{site.paragraph}</p>
                  <button>{site.button} <span>↗</span></button>
                </div>
                <div className="shape shape-one" />
                <div className="shape shape-two" />
                <span className="edition">ISSUE Nº 01</span>
              </div>
            )}
          </div>
        </section>
      </section>

      <section className="control-deck">
        <div className="prompt-area">
          <div className="prompt-label">
            <span className="spark">✦</span>
            <div>
              <strong>Direct the canvas</strong>
              <span>{status}</span>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              applyTypedPrompt()
            }}
          >
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Try “make it dark and electric”…"
              aria-label="Page edit prompt"
            />
            <button type="submit" disabled={!prompt.trim()}>
              Apply edit <span>↗</span>
            </button>
          </form>
          <div className="suggestions">
            <span>TRY</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setPrompt(suggestion)
                  applyTypedPrompt(suggestion)
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="voice-area">
          <button
            className={`voice-button ${recording ? 'recording' : ''}`}
            onClick={recording ? stopVoice : startVoice}
            aria-label={recording ? 'Stop voice edit' : 'Start voice edit'}
          >
            <span className="mic-icon">{recording ? '■' : '●'}</span>
          </button>
          <div>
            <strong>{recording ? 'Listening…' : 'Speak to edit'}</strong>
            <span>
              {realtimeAvailable ? 'OpenAI Realtime ready' : 'API key not configured'}
            </span>
          </div>
          <div className={`waveform ${recording ? 'active' : ''}`} aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
