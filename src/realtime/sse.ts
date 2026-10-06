import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ServerResponse } from 'node:http'
import type { CarnetOrdres } from '../domain.ts'
import type { Store } from '../store.ts'
import { SequencedInstrument, type Delta } from './convergence.exemple.ts'
import { isAllowedOrigin } from './origin.ts'
import type { RedisMarket } from './redis-market.ts'

const HEARTBEAT_MS = 15_000

export function createSseHandler(app: FastifyInstance, store: Store, market?: RedisMarket) {
  const instruments = new Map(
    [...store.carnets].map(([sym, carnet]) => [sym, new SequencedInstrument(carnet)]),
  )
  const clients = new Map<string, Set<ServerResponse>>()

  app.addHook('onClose', (_instance, done) => {
    for (const group of clients.values()) for (const client of group) client.end()
    done()
  })

  function publish(carnet: CarnetOrdres): void {
    const delta = instruments.get(carnet.instrument)?.push(carnet)
    if (!delta) return
    for (const client of clients.get(carnet.instrument) ?? []) {
      send(client, 'delta', delta, delta.seq)
    }
  }

  async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (market) return redisHandler(request, reply, market)
    const sym = (request.query as { instrument?: string }).instrument?.toUpperCase()
    const instrument = sym && instruments.get(sym)
    if (!instrument) {
      reply.code(404).send({ error: 'instrument inconnu' })
      return
    }

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
    response.write('retry: 1000\n\n')
    response.flushHeaders()

    const rawId = request.headers['last-event-id'] ?? (request.query as { from?: string }).from
    const lastSeq = typeof rawId === 'string' ? Number(rawId) : NaN
    if (!Number.isSafeInteger(lastSeq) || lastSeq < 0 || lastSeq > instrument.seqCourant) {
      const snapshot = instrument.resync(-1)
      if (snapshot.type === 'snapshot') send(response, 'snapshot', snapshot.carnet, snapshot.carnet.seq)
    } else {
      const recovery = instrument.resync(lastSeq)
      if (recovery.type === 'snapshot') {
        send(response, 'recovery', { type: 'snapshot' })
        send(response, 'snapshot', recovery.carnet, recovery.carnet.seq)
      } else {
        send(response, 'recovery', { type: 'replay', count: recovery.deltas.length })
        for (const delta of recovery.deltas) send(response, 'delta', delta, delta.seq)
      }
    }

    const group = clients.get(sym!) ?? new Set<ServerResponse>()
    group.add(response)
    clients.set(sym!, group)
    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) response.write(': heartbeat\n\n')
    }, HEARTBEAT_MS)
    response.on('close', () => {
      clearInterval(heartbeat)
      group.delete(response)
    })
  }

  return { handler, publish }
}

async function redisHandler(request: FastifyRequest, reply: FastifyReply, market: RedisMarket): Promise<void> {
  const sym = (request.query as { instrument?: string }).instrument?.toUpperCase()
  const state = await market.read()
  const book = sym && state.carnets.get(sym)
  if (!book) {
    reply.code(404).send({ error: 'instrument inconnu' })
    return
  }

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
  response.write('retry: 1000\n\n')
  const raw = request.headers['last-event-id'] ?? (request.query as { from?: string }).from
  const from = typeof raw === 'string' ? Number(raw) : NaN
  let cursor = from
  if (!Number.isSafeInteger(from) || from < 0 || from > book.seq) {
    cursor = book.seq
    send(response, 'snapshot', book, cursor)
  } else {
    send(response, 'recovery', { type: 'replay', count: book.seq - from })
  }

  // The durable sorted set is also the live source: no subscribe/replay race or local buffer.
  let lastHeartbeat = Date.now()
  try {
    while (!response.destroyed && !response.writableEnded) {
      const batch = await market.replay(sym!, cursor)
      for (const carnet of batch) {
        send(response, 'delta', { seq: carnet.seq, carnet }, carnet.seq)
        cursor = carnet.seq
        if (response.writableNeedDrain) {
          await new Promise<void>((resolve) => {
            const done = () => { response.off('drain', done); response.off('close', done); resolve() }
            response.once('drain', done)
            response.once('close', done)
          })
        }
        if (response.destroyed) break
      }
      if (batch.length === 0) {
        if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
          response.write(': heartbeat\n\n')
          lastHeartbeat = Date.now()
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
  } catch (error) {
    console.error('Redis SSE replay:', error)
  } finally {
    response.end()
  }
}

function send(response: ServerResponse, event: string, data: Delta | CarnetOrdres | object, id?: number) {
  if (response.destroyed || response.writableEnded) return
  response.write(`${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
