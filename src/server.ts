import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerRoutes } from './rest.ts'
import { createStore, avancer, parseClientMessage, type ClientMessage } from './store.ts'
import { startNaiveStub } from './realtime/naive-stub.ts'

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

// // --- couche temps reel : stub naif (a remplacer, voir TRANSPOSITION.md) ---
// startNaiveStub<ClientMessage>(app.server, {
//   // diffuse TOUS les carnets a TOUT LE MONDE (defaut : etape 4, pas d'abonnement par instrument)
//   fullState: () => Object.fromEntries(store.carnets),
//   parseInput: parseClientMessage,
//   applyInput: () => {}, // "subscribe" est ignore : le stub envoie tout de toute facon
// })
// console.log('couche temps reel : stub naif (voir src/realtime/naive-stub.ts)')
