import type { FastifyInstance } from 'fastify'
import { createSseHandler } from './realtime/sse.ts'
import { createJwt, SECRET } from './realtime/ws/security-helpers.ts'
import type { Store } from './store.ts'
import type { CarnetOrdres } from './domain.ts'
import type { RedisMarket } from './realtime/redis-market.ts'

export function registerRoutes(app: FastifyInstance, store: Store, market?: RedisMarket): (carnet: CarnetOrdres) => void {
  const sse = createSseHandler(app, store, market)

  app.get('/api/instruments', async () => store.instruments)

  app.post('/api/auth/token', async (request, reply) => {
    const rawUsername = (request.body as { username?: unknown } | null)?.username
    const username = typeof rawUsername === 'string' ? rawUsername.trim() : ''

    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(username)) {
      return reply.code(400).send({
        error: 'Le nom doit contenir 2 a 32 lettres, chiffres, _ ou -',
      })
    }

    return {
      username,
      token: createJwt(username, SECRET),
      expiresIn: '4h',
    }
  })

  app.get('/api/bids', async () => (market ? await market.read() : store).bidsRecents.slice(-30))

  app.get('/api/instruments/:sym/book', async (req, reply) => {
    const sym = (req.params as { sym: string }).sym.toUpperCase()
    const carnet = (market ? await market.read() : store).carnets.get(sym)
    if (!carnet) return reply.code(404).send({ error: 'instrument inconnu' })
    return carnet
  })

  app.get('/api/instruments/:sym/history', async (req, reply) => {
    const sym = (req.params as { sym: string }).sym.toUpperCase()
    if (!store.carnets.has(sym)) return reply.code(404).send({ error: 'instrument inconnu' })
    const from = Number((req.query as { from?: string }).from ?? 0)
    const hist = market ? await market.replay(sym, from - 1, 1_000) : store.historique.get(sym)!
    return hist.filter((c) => c.seq >= from).map((c) => ({ seq: c.seq, prix: c.dernierPrix }))
  })

  app.get('/api/stream', sse.handler)
  return sse.publish
}
