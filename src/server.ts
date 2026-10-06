import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerRoutes } from './rest.ts'
import { createStore, avancer } from './store.ts'
import { attachRedisAdapter, startSocketIoServer } from './realtime/socketio/server.ts'
import { isAllowedOrigin } from './realtime/origin.ts'
import { connectMarket } from './realtime/redis-market.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3009)

const store = createStore()
if (process.env.REDIS_URL && !process.env.JWT_SECRET) throw new Error('JWT_SECRET is required with REDIS_URL')
const market = process.env.REDIS_URL ? await connectMarket(process.env.REDIS_URL) : undefined
const app = Fastify({ logger: false })

await app.register(fastifyCors, {
  origin: (origin, done) => done(null, isAllowedOrigin(origin)),
})
await app.register(fastifyStatic, { root: join(HERE, '..', 'public') })
const publish = registerRoutes(app, store, market)

const io = startSocketIoServer(app.server, store, market)
if (process.env.REDIS_URL) {
  const closeRedis = await attachRedisAdapter(io, process.env.REDIS_URL)
  app.addHook('onClose', async () => { await closeRedis(); await market!.redis.quit() })
}
app.addHook('preClose', (done) => {
  io.local.disconnectSockets(true)
  done()
})

await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`cotations-marche : http://localhost:${PORT}`)
console.log(`couche Socket.IO : auth.token JWT obligatoire`)

let ticking = false
setInterval(() => {
  if (ticking) return
  if (!market) {
    const bidSimule = avancer(store)
    for (const carnet of store.carnets.values()) publish(carnet)
    if (bidSimule) io.emit('bid:new', bidSimule)
    return
  }
  ticking = true
  void market.tick().then((bid) => { if (bid) io.emit('bid:new', bid) })
    .catch((error) => console.error('Redis tick:', error))
    .finally(() => { ticking = false })
}, 500)
