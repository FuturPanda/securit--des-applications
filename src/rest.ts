import type { FastifyInstance } from 'fastify'
import { createSseHandler } from './realtime/sse.ts'
import type { Store } from './store.ts'

export function registerRoutes(app: FastifyInstance, store: Store): void {
  const sseHandler = createSseHandler(app, () => ({
    carnets: Object.fromEntries(store.carnets),
    bids: store.bidsRecents.slice(-30),
  }))

  app.get('/api/instruments', async () => store.instruments)

  app.get('/api/bids', async () => store.bidsRecents.slice(-30))

  app.get('/api/instruments/:sym/book', async (req, reply) => {
    const sym = (req.params as { sym: string }).sym.toUpperCase()
    const carnet = store.carnets.get(sym)
    if (!carnet) return reply.code(404).send({ error: 'instrument inconnu' })
    return carnet
  })

  app.get('/api/instruments/:sym/history', async (req, reply) => {
    const sym = (req.params as { sym: string }).sym.toUpperCase()
    const hist = store.historique.get(sym)
    if (!hist) return reply.code(404).send({ error: 'instrument inconnu' })
    const from = Number((req.query as { from?: string }).from ?? 0)
    return hist.filter((c) => c.seq >= from).map((c) => ({ seq: c.seq, prix: c.dernierPrix }))
  })

  app.get('/api/stream', sseHandler)
}
