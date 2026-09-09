import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify'
import type { ServerResponse } from 'node:http'
import { isAllowedOrigin } from './origin.ts'

interface SseEvent {
  id: number
  data: string
}

const MAX_BUFFER_SIZE = 100
const HEARTBEAT_INTERVAL_MS = 15_000
const EVENT_INTERVAL_MS = 500

export function createSseHandler(
  app: FastifyInstance,
  getState: () => unknown,
) {
  const events: SseEvent[] = []
  const clients = new Set<ServerResponse>()
  let nextEventId = 1

  const record = (data: string): SseEvent => {
    const event = { id: nextEventId++, data }
    events.push(event)

    if (events.length > MAX_BUFFER_SIZE) {
      events.shift()
    }

    return event
  }

  const producer = setInterval(() => {
    const data = JSON.stringify({ type: 'state', state: getState() })
    broadcast(clients, record(data))
  }, EVENT_INTERVAL_MS)

  app.addHook('onClose', (_instance, done) => {
    clearInterval(producer)

    for (const client of clients) {
      client.end()
    }

    clients.clear()
    done()
  })

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.hijack()

    const response = reply.raw
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    }
    const origin = request.headers.origin
    if (origin && isAllowedOrigin(origin, request.headers.host)) {
      headers['Access-Control-Allow-Origin'] = origin
      headers.Vary = 'Origin'
    }

    response.writeHead(200, headers)
    response.write('retry: 3000\n\n')
    response.flushHeaders()

    const lastEventId = parseLastEventId(request.headers['last-event-id'])
    const oldestBufferedId = events[0]?.id

    if (
      oldestBufferedId !== undefined &&
      lastEventId > 0 &&
      lastEventId < oldestBufferedId - 1
    ) {
      response.write(
        'event: resync-needed\n' +
          'data: buffer dépassé, rechargez un instantané complet\n\n',
      )
    } else {
      for (const event of events) {
        if (event.id > lastEventId) {
          send(response, event)
        }
      }
    }

    clients.add(response)

    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(': heartbeat\n\n')
      }
    }, HEARTBEAT_INTERVAL_MS)

    response.on('close', () => {
      clearInterval(heartbeat)
      clients.delete(response)
    })
  }
}

function parseLastEventId(header: string | string[] | undefined): number {
  const rawValue = Array.isArray(header) ? header[0] : header
  const value = Number(rawValue ?? 0)
  return Number.isFinite(value) ? value : 0
}

function send(
  response: ServerResponse,
  event: SseEvent,
  eventName?: string,
): void {
  if (response.destroyed || response.writableEnded) return

  response.write(`id: ${event.id}\n`)

  if (eventName) {
    response.write(`event: ${eventName}\n`)
  }

  // SSE requires one `data:` prefix per line.
  for (const line of event.data.split(/\r?\n/)) {
    response.write(`data: ${line}\n`)
  }

  response.write('\n')
}

function broadcast(clients: Set<ServerResponse>, event: SseEvent): void {
  for (const client of clients) {
    if (client.destroyed || client.writableEnded) {
      clients.delete(client)
      continue
    }

    send(client, event)
  }
}
