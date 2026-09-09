import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerRoutes } from './rest.ts'
import { createStore, avancer } from './store.ts'
import { startWsServer } from './realtime/ws/server.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)

const store = createStore()
const app = Fastify({ logger: false })

await app.register(fastifyStatic, { root: join(HERE, '..', 'public') })
registerRoutes(app, store)

await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`cotations-marche : http://localhost:${PORT}`)

// Le marche avance, que quelqu'un ecoute ou non.
setInterval(() => avancer(store), 500)

// --- couche WebSocket securisee (voir src/realtime/ws) ---
startWsServer(app.server)
console.log(`couche WebSocket : ws://localhost:${PORT}?token=<TOKEN>`)
